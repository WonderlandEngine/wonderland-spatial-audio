import {_audioContext, _unlockAudioContext} from './audio-listener.js';
import {Emitter} from '@wonderlandengine/api';
import {
    BufferPlayer,
    DEF_VOL,
    MIN_RAMP_TIME,
    MIN_VOLUME,
    OneShotPlayer,
} from './audio-players.js';

/**
 * Enumerates the available channels within the AudioManager.
 * These channels can be utilized to regulate global volume of audio.
 */
export enum AudioChannel {
    /** Intended for sound effects. Connects to Master AudioChannel. */
    SFX,
    /** Intended for music. Connects to Master AudioChannel. */
    MUSIC,
    /** Connects directly to output. */
    MASTER,
}

/**
 * Enumerates the possible states of playback for audio sources.
 */
export enum PlayState {
    /** The source has loaded and is ready to be played */
    READY,
    /** The source has started playing */
    PLAYING,
    /** The source has stopped */
    STOPPED,
}

/**
 * Represents a combination of a unique identifier and a play state.
 */
type PlayStateWithID = {
    /** Unique identifier associated with the audio source. */
    id: number;
    /** Current state of playback for the audio source. */
    state: PlayState;
};

/**
 * Combines all settings for configuring playback in the AudioManager.
 *
 * @note The playOneShot() function utilizes this configuration for consistent playback settings. However, one-shots
 * are incapable of looping and do not alter their audio channel.
 */
export type PlayConfig = {
    /** Sets the volume of the player (0-1) */
    volume?: number;
    /** Whether to loop the audio */
    loop?: boolean;
    /**
     * Sets the position of the audio source and makes it spatial.
     *
     * @note Panned audio will always use HRTF for spatialization.
     * @warning For this to work correctly, the audio-listener needs to be set up!
     */
    position?: Float32Array;
    /** Sets the channel on which the audio will be played. */
    channel?: AudioChannel;
    /** Whether the audio has priority or not. */
    priority?: boolean;
};

/**
 * Default number of one-shot players.
 */
export const DEF_ONESHT_PLR_COUNT = 16;

/**
 * Default number of regular players.
 */
export const DEF_PLR_COUNT = 16;

const SHIFT_AMOUNT = 16;
const MAX_NUMBER_OF_INSTANCES = (1 << SHIFT_AMOUNT) - 1;

/**
 * Manages audio files and players, providing control over playback on three audio channels.
 *
 * @classdesc
 * The AudioManager handles audio files and players, offering control over playback on three distinct channels.
 * It supports two types of players: OneShot players, which play audio once and return, and regular players.
 * OneShot players are less configurable but more performant than regular players.
 * @see AudioChannel
 *
 * @note The AudioManager is able to play audio with spatial positioning. Keep in mind that for this to work
 * correctly, you will need to set up the `audio-listener` component!
 *
 * @example
 * ```js
 * enum Sounds {
 *      Click,
 *      GunShot,
 * }
 *
 * // AudioManager can't be constructed in a non-browser environment!
 * export const am = window.AudioContext ? new AudioManager() : null;
 *
 * start() {
 *      am.load('path/to/click.wav', Sounds.Click);
 *      am.load('path/to/gunshot.wav', Sounds.GunShot);
 * }
 *
 * onPress() {
 *      am.play(Sounds.Click, {volume: 0.8, position: [0, 5, 1]});
 * }
 * ```
 *
 */
export class AudioManager {
    /** The emitter will notify all listeners about the PlayState of a unique ID.
     *
     * @note
     * - READY will be emitted if all sources of a given source ID have loaded.
     * - PLAYING / STOPPED are only emitted for play IDs that are returned by the play() method.
     * - If you want to check the status for a source ID, convert the play ID of the message using the
     *   getSourceIdFromPlayId() method.
     * - OneShots won't give status updates.
     *
     * @see getSourceIdFromPlayId
     * @example
     * ```js
     * const music = audioManager.play(Sounds.Music);
     * audioManager.emitter.add((msg) => {
     *    if (msg.id === music) {
     *          console.log(msg.state);
     *    }
     * });
     * ```
     */
    readonly emitter = new Emitter<[PlayStateWithID]>();

    /* Cache for decoded audio buffers */
    private _bufferCache: (AudioBuffer[] | undefined)[] = [];

    /* Simple, fast cache for one-shot nodes */
    private readonly _oneShotCache!: ReadonlyArray<OneShotPlayer>;
    private _oneShotIndex = 0;

    /* Cache for regular nodes */
    private _freePlayers: BufferPlayer[] = [];
    private _busyPlayers = new Map<number, BufferPlayer>();
    /* Counts how many times a sourceId has played. Resets to 0 after {@link MAX_NUMBER_OF_INSTANCES }. */
    private _instanceCounter: number[] = [];

    private readonly _masterGain = new GainNode(_audioContext);
    private readonly _musicGain = new GainNode(_audioContext);
    private readonly _sfxGain = new GainNode(_audioContext);

    /**
     * Constructs a AudioManager.
     *
     * Uses the default amount of one-shot and regular players.
     * @see DEF_ONESHT_PLR_COUNT
     * @see DEF_PLR_COUNT
     * @example
     * ```js
     * // AudioManager can't be constructed in a non-browser environment!
     * export const am = window.AudioContext ? new AudioManager() : null!;
     * ```
     */
    constructor() {
        this._sfxGain.connect(this._masterGain);
        this._musicGain.connect(this._masterGain);
        this._masterGain.connect(_audioContext.destination);
        this._oneShotCache = this._initOneShotCache(DEF_ONESHT_PLR_COUNT);

        /* Initialize buffer player cache */
        for (let i = 0; i < DEF_PLR_COUNT; i++) {
            this._freePlayers[i] = new BufferPlayer(this);
        }
    }

    private _initOneShotCache(size: number) {
        const cache: OneShotPlayer[] = [];
        for (let i = 0; i < size; i++) {
            cache[i] = new OneShotPlayer(this);
        }
        return cache;
    }

    /**
     * Decodes and stores the given audio files and associates them with the given ID.
     *
     * @param path Path to the audio files. Can either be a single string or a list of strings.
     * @param id Identifier for the given audio files.
     *
     * @note Is there more than one-audio file available per id, on playback, they will be selected at random.
     * This enables easy variation of the same sounds!
     *
     * @throws If negative ID was provided.
     *
     * @returns A Promise that resolves when all files are successfully loaded.
     */
    async load(path: string[] | string, id: number) {
        if (id < 0) {
            throw 'audio-manager: Negative IDs are not valid! Skipping ${path}';
        }
        const paths = Array.isArray(path) ? path : [path];
        if (!this._bufferCache[id]) {
            this._bufferCache[id] = [];
        }
        for (let i = 0; i < paths.length; i++) {
            const response = await fetch(paths[i]);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await _audioContext.decodeAudioData(arrayBuffer);
            this._bufferCache[id]!.push(audioBuffer);
        }

        /* Init the instanceCounter */
        this._instanceCounter[id] = 0;
        this.emitter.notify({id: id, state: PlayState.READY});
    }

    /**
     * Analogous to load(), but lets you easily load a bunch of files without needing to call the manager everytime.
     *
     * @see load
     *
     * @note Logs an error message to the console if one pair failed to load.
     *
     * @param pair Pair of source files and associating identifier.
     * Multiple pairs can be provided as separate arguments.
     *
     * @returns A Promise that resolves when all files are successfully loaded.
     */
    async loadBatch(...pair: [string[] | string, number][]) {
        for (const p of pair) {
            try {
                await this.load(p[0], p[1]);
            } catch (e) {
                console.error(e);
            }
        }
    }

    /**
     * Plays the audio file associated with the given ID.
     *
     * @param id ID of the file that should be played.
     * @param config Optional parameter that will configure how the audio is played. Is no configuration provided,
     * the audio will play at volume 1.0, without panning and on the SFX channel, priority set to false.
     *
     * @note If the 'priority' parameter is set to true, the audio playback will not be interrupted
     * to allocate a player in case all players are currently occupied. If 'priority' is set to false (default),
     * playback may be interrupted to allocate a player for a new 'play()' call.
     *
     * @throws If the given ID does not have a buffer associated with it or there are no available players.
     *
     * @returns A Promise that resolves with a playId when the audio has started playing.
     */
    async play(id: number, config?: PlayConfig) {
        const buffer = this._bufferCache[id];
        if (!buffer) {
            throw `audio-manager: No audio source is associated with identifier: ${id} !`;
        }
        const player = this._freePlayers.pop() || this._freePlayerWithLowPriority();
        if (!player) {
            throw `audio-manager: All players are busy and no low priority player could be found to free up!`;
        }

        const instanceCount = this._instanceCounter[id];
        const unique_id = (id << SHIFT_AMOUNT) + instanceCount;
        this._instanceCounter[id] = (instanceCount + 1) % MAX_NUMBER_OF_INSTANCES;

        this._busyPlayers.set(unique_id, player);
        if (_audioContext.state === 'suspended') {
            await _unlockAudioContext();
        }
        player.priority = config?.priority || false;
        player.play(buffer, unique_id, config);
        this.emitter.notify({id: unique_id, state: PlayState.PLAYING});
        return unique_id;
    }

    private _freePlayerWithLowPriority() {
        for (const player of this._busyPlayers.values()) {
            if (player.priority) continue;
            player.stopAndFree();
            return this._freePlayers.pop();
        }
    }

    /**
     * Plays the audio file associated with the given ID until it naturally ends.
     *
     * @note
     * - IDs can be triggered as often as there are one-shot players in the AudioManager.
     * - One shots work with First-In-First-Out principle. If all players are occupied, the manager will stop the
     *   one that started playing first, to free up a player for the new ID.
     * - One-shots are always connect to the SFX channel.
     * - One-shots cant loop.
     * - One-shots can only be stopped all at once with stopOneShots().
     * - One-shots can't be assigned a priority.
     *
     * @param id ID of the file that should be played.
     * @param config  Optional parameter that will configure how the audio is played. Note that only the position
     * and volume settings will affect the playback.
     * @throws If the given ID does not have a buffer associated with it.
     *
     * @returns A Promise that resolves when the audio has started playing.
     */
    async playOneShot(id: number, config?: PlayConfig) {
        const buffers = this._bufferCache[id];
        if (!buffers) {
            throw `audio-manager: No audio source is associated with identifier: ${id} !`;
        }
        const audioBuffer = buffers[Math.floor(Math.random() * buffers.length)];
        const player = this._oneShotCache[this._oneShotIndex];
        await player.play(audioBuffer, config?.volume || DEF_VOL, config?.position);
        /* Advance cache pointer */
        this._oneShotIndex = (this._oneShotIndex + 1) % DEF_ONESHT_PLR_COUNT;
    }

    /**
     * Stops the audio associated with the given ID.
     *
     * @warning This does not work for one-shots!
     *
     * @param sourceId Identifier of the audio source that should be stopped.
     * @param playId Optional parameter that specifies the exact audio that should be stopped.
     * If not provided, all audio of the given sourceId will be stopped.
     *
     * @note Obtain the playId from the play() method.
     * @see play
     */
    stop(sourceId: number, playId?: number) {
        if (playId) {
            this._busyPlayers.get(playId)?.stopAndFree();
            return;
        }
        this._busyPlayers.forEach((player) => {
            if (player.bufferId >> SHIFT_AMOUNT === sourceId) {
                player.stopAndFree();
            }
        });
    }

    /**
     * Stops playback of all one-shot players.
     */
    stopOneShots() {
        for (const node of this._oneShotCache) {
            node.stop();
        }
    }

    /**
     * Stops all audio.
     */
    stopAll() {
        this.stopOneShots();
        this._busyPlayers.forEach((value) => {
            value.stopAndFree();
        });
    }

    /**
     * Sets the volume of the given audio channel.
     *
     * @param channel Specifies the audio channel type that should be modified.
     * @param volume Volume that the channel should be set to.
     * @param time Optional time parameter that specifies the time it takes for the channel to reach the specified
     * volume in seconds (Default is 0).
     */
    setGlobalVolume(channel: AudioChannel, volume: number, time = 0) {
        volume = Math.max(MIN_VOLUME, volume);
        time = _audioContext.currentTime + Math.max(MIN_RAMP_TIME, time);
        switch (channel) {
            case AudioChannel.MUSIC:
                this._musicGain.gain.linearRampToValueAtTime(volume, time);
                break;
            case AudioChannel.SFX:
                this._sfxGain.gain.linearRampToValueAtTime(volume, time);
                break;
            case AudioChannel.MASTER:
                this._masterGain.gain.linearRampToValueAtTime(volume, time);
                break;
            default:
                return;
        }
    }

    /**
     * Removes all decoded audio from the manager that is associated with the given ID.
     *
     * @warning This will stop playback of the given ID.
     * @param id Identifier of the audio that should be removed.
     */
    remove(id: number) {
        if (id < 0) return;
        this.stop(id);
        this._bufferCache[id] = undefined;
        this._instanceCounter[id] = 0;
    }

    /**
     * Removes all decoded audio from the manager, effectively resetting it.
     *
     * @warning This will stop playback entirely.
     */
    removeAll() {
        this.stopAll();
        this._bufferCache.length = 0;
        this._instanceCounter.length = 0;
    }

    /**
     * Gets the sourceId of a playId.
     *
     * @param playId of which to get the sourceId from.
     */
    getSourceIdFromPlayId(playId: number) {
        return playId >> SHIFT_AMOUNT;
    }

    /**
     * Frees a player that was currently playing the given ID.
     *
     * @warning This is for internal use only, use at your own risk!
     * @param playId Identifier of previously playing audio.
     */
    _freeUpBusyPlayer(playId: number) {
        const player = this._busyPlayers.get(playId);
        if (player) {
            this._busyPlayers.delete(playId);
            this._freePlayers.push(player);
        }
    }

    /**
     * Gets the current amount of free regular players in the audio manager.
     *
     * @note Use this to check how many resources your current project is using.
     */
    get amountOfFreePlayers() {
        return this._freePlayers.length;
    }
}

/**
 * Global instance of a AudioManager.
 */
export const globalAudioManager = window.AudioContext ? new AudioManager() : null!;

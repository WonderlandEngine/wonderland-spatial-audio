import {_audioContext} from './audio-listener.js';
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
 * These channels can be utilized to regulate global volume.
 */
export enum AudioChannel {
    /** Intended for sound effects. Connects to Master AudioChannel. */
    Sfx,
    /** Intended for music. Connects to Master AudioChannel. */
    Music,
    /** Connects directly to output. */
    Master,
}

/**
 * Enumerates the possible states of playback for audio sources.
 */
export enum PlayState {
    /** The source has loaded and is ready to be played */
    Ready,
    /** The source has started playing */
    Playing,
    /** The source has stopped */
    Stopped,
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
 * can only change their volume and position.
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
    /**
     * Whether the audio has priority or not. If not, playback can be stopped to free up a player when no others are
     * available.
     */
    priority?: boolean;
};

/**
 * Default number of one-shot players.
 */
export const DEF_ONESHOT_PLAYER_COUNT = 16;

/**
 * Default number of regular players.
 */
export const DEF_PLAYER_COUNT = 16;

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
 * if (am != null) {
 *      am.load('path/to/click.wav', Sounds.Click);
 *      am.load('path/to/gunshot.wav', Sounds.GunShot);
 * }
 *
 * onPress() {
 *      am.play(Sounds.Click, {volume: 0.8, position: [0, 5, 1]});
 * }
 * ```
 */
export class AudioManager {
    /** The emitter will notify all listeners about the PlayState of a unique ID.
     *
     * @note
     * - READY will be emitted if all sources of a given source ID have loaded.
     * - PLAYING / STOPPED are only emitted for play IDs that are returned by the play() method.
     * - If you want to check the status for a source ID, convert the play ID of the message using the
     *   getSourceIdFromPlayId() method.
     * - One-shots won't give status updates.
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

    private _masterGain: GainNode;
    private _musicGain: GainNode;
    private _sfxGain: GainNode;

    private _unlocked = false;
    private _autoplayStorage: [number, PlayConfig | undefined][] = [];

    private _randomFunction: () => number = Math.random;


    /**
     * Constructs a AudioManager.
     *
     * Uses the default amount of one-shot and regular players.
     * @see DEF_ONESHOT_PLAYER_COUNT
     * @see DEF_PLAYER_COUNT
     * @example
     * ```js
     * // AudioManager can't be constructed in a non-browser environment!
     * export const am = window.AudioContext ? new AudioManager() : null!;
     * ```
     */
    constructor() {
        this._unlockAudioContext();
        this._sfxGain = new GainNode(_audioContext);
        this._masterGain = new GainNode(_audioContext);
        this._musicGain = new GainNode(_audioContext);
        this._sfxGain.connect(this._masterGain);
        this._musicGain.connect(this._masterGain);
        this._masterGain.connect(_audioContext.destination);
        this._oneShotCache = this._initOneShotCache(DEF_ONESHOT_PLAYER_COUNT);

        /* Initialize buffer player cache */
        for (let i = 0; i < DEF_PLAYER_COUNT; i++) {
            this._freePlayers[i] = new BufferPlayer(this);
        }
    }

    /**
     * Decodes and stores the given audio files and associates them with the given ID.
     *
     * @param path Path to the audio files. Can either be a single string or a list of strings.
     * @param id Identifier for the given audio files.
     *
     * @note Is there more than one audio file available per id, on playback, they will be selected at random.
     * This enables easy variation of the same sounds!
     *
     * @throws If negative ID was provided.
     *
     * @returns A Promise that resolves when all files are successfully loaded.
     */
    async load(path: string[] | string, id: number) {
        if (id < 0) {
            throw new Error('audio-manager: Negative IDs are not valid! Skipping ${path}.');
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
        this.emitter.notify({id: id, state: PlayState.Ready});
    }

    /**
     * Same as load(), but lets you easily load a bunch of files without needing to call the manager everytime.
     *
     * @see load
     *
     * @param pair Pair of source files and associating identifier.
     * Multiple pairs can be provided as separate arguments.
     *
     * @throws If negative ID was provided.
     *
     * @returns A Promise that resolves when all files are successfully loaded.
     */
    async loadBatch(...pair: [string[] | string, number][]) {
        for (const p of pair) {
            await this.load(p[0], p[1]);
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
     * @returns The playId that identifies this specific playback, so it can be stopped or identified in the
     * emitter. If playback could not be started, an invalid playId is returned.
     */
    play(id: number, config?: PlayConfig) {
        const bufferList = this._bufferCache[id];
        if (!bufferList) {
            throw new Error(`audio-manager: No audio source is associated with identifier: ${id}`);
        }
        if (!this._unlocked) {
            return -1;
        }
        const player = this._freePlayers.pop() ?? this._stopLowPriorityPlayer();
        if (!player) {
            throw new Error(`audio-manager: All players are busy and no low priority player could be found to free up.`);
        }

        const unique_id = this._generateUniqueId(id);

        this._busyPlayers.set(unique_id, player);
        player.priority = config?.priority ?? false;
        player.play(this._selectRandomBuffer(bufferList), unique_id, config);
        this.emitter.notify({id: unique_id, state: PlayState.Playing});
        return unique_id;
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
     */
    playOneShot(id: number, config?: PlayConfig) {
        const bufferList = this._bufferCache[id];
        if (!bufferList) {
            throw new Error(`audio-manager: No audio source is associated with identifier: ${id}`);
        }
        const player = this._oneShotCache[this._oneShotIndex];
        player.play(this._selectRandomBuffer(bufferList), config?.volume ?? DEF_VOL, config?.position);
        /* Advance cache pointer */
        this._oneShotIndex = (this._oneShotIndex + 1) % DEF_ONESHOT_PLAYER_COUNT;
    }


    /**
     * Same as `play()` but waits until the user has interacted with the website.
     *
     * @param id ID of the file that should be played.
     * @param config Optional parameter that will configure how the audio is played. Is no configuration provided,
     * the audio will play at volume 1.0, without panning and on the SFX channel, priority set to false.
     *
     * @returns The playId that identifies this specific playback, so it can be stopped or identified in the
     * emitter.
     */
    autoplay(id: number, config?: PlayConfig) {
        if (this._unlocked) {
            return this.play(id, config);
        }
        const uniqueId = this._generateUniqueId(id);
        this._autoplayStorage.push([uniqueId, config]);
        return uniqueId;
    }

    /**
     * Stops the audio associated with the given ID.
     *
     * @warning This does not work for one-shots!
     *
     * @param sourceId Identifier of the audio source that should be stopped.
     * @param playId Optional parameter that specifies the exact audio that should be stopped.
     * If not provided, all playing instances of the given sourceId will be stopped.
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
     * @param channel Specifies the audio channel that should be modified.
     * @param volume Volume that the channel should be set to.
     * @param time Optional time parameter that specifies the time it takes for the channel to reach the specified
     * volume in seconds (Default is 0).
     */
    setGlobalVolume(channel: AudioChannel, volume: number, time = 0) {
        volume = Math.max(MIN_VOLUME, volume);
        time = _audioContext.currentTime + Math.max(MIN_RAMP_TIME, time);
        switch (channel) {
            case AudioChannel.Music:
                this._musicGain.gain.linearRampToValueAtTime(volume, time);
                break;
            case AudioChannel.Sfx:
                this._sfxGain.gain.linearRampToValueAtTime(volume, time);
                break;
            case AudioChannel.Master:
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
        this._instanceCounter[id] = -1;
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
     * Gets the current amount of free regular players in the audio manager.
     *
     * @note Use this to check how many resources your current project is using.
     */
    get amountOfFreePlayers() {
        return this._freePlayers.length;
    }

    /**
     * Sets the random function the manager will use for selecting buffers.
     *
     * @note Default random function is Math.random()
     * @param func Function that should be used for select the buffer.
     */
    set randomBufferSelectFunction(func: () => number) {
        this._randomFunction = func;
    }

    private _selectRandomBuffer(bufferList: AudioBuffer[]) {
        return bufferList[Math.floor(this._randomFunction() * bufferList.length)];
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

    private _playWithUniqueId(uniqueId: number, config?: PlayConfig) {
        const id = this.getSourceIdFromPlayId(uniqueId);
        const bufferList = this._bufferCache[id];
        if (!bufferList) {
            throw new Error(`audio-manager: No audio source is associated with identifier: ${id}`);
        }
        const player = this._freePlayers.pop() ?? this._stopLowPriorityPlayer();
        if (!player) {
            throw new Error(`audio-manager: All players are busy and no low priority player could be found to free up.`);
        }

        this._busyPlayers.set(uniqueId, player);
        player.priority = config?.priority ?? false;
        player.play(this._selectRandomBuffer(bufferList), uniqueId, config);
        this.emitter.notify({id: uniqueId, state: PlayState.Playing});
    }

    private _generateUniqueId(id: number) {
        let instanceCount = this._instanceCounter[id];
        if(!instanceCount) instanceCount = 0;
        else if (instanceCount === -1) return -1;
        const unique_id = (id << SHIFT_AMOUNT) + instanceCount;
        this._instanceCounter[id] = (instanceCount + 1) % MAX_NUMBER_OF_INSTANCES;
        return unique_id;
    }

    private _stopLowPriorityPlayer() {
        for (const player of this._busyPlayers.values()) {
            if (player.priority) continue;
            player.stopAndFree();
            return this._freePlayers.pop();
        }
    }

    private _initOneShotCache(size: number) {
        const cache: OneShotPlayer[] = [];
        for (let i = 0; i < size; i++) {
            cache[i] = new OneShotPlayer(this);
        }
        return cache;
    }

    private _unlockAudioContext() {
        const unlockHandler = () => {
            _audioContext.resume().then(() => {
                window.removeEventListener('click', unlockHandler);
                window.removeEventListener('touch', unlockHandler);
                window.removeEventListener('keydown', unlockHandler);
                window.removeEventListener('mousedown', unlockHandler);
                this._unlocked = true;
                for (const audio of this._autoplayStorage) {
                    this._playWithUniqueId(audio[0], audio[1]);
                }
                this._autoplayStorage.length = 0;
            });
        };

        window.addEventListener('click', unlockHandler);
        window.addEventListener('touch', unlockHandler);
        window.addEventListener('keydown', unlockHandler);
        window.addEventListener('mousedown', unlockHandler);
    }

}

class EmptyAudioManager {
    async load(path: string[] | string, id: number) {}
    async loadBatch(...pair: [string[] | string, number][]) {}
}

/**
 * Global instance of a AudioManager.
 *
 * @note
 * To construct an AudioManager, the WebAudio API is needed. For non-browser environments, like during the packaging
 * step of the wonderland editor, the globalAudioManager is set to an `EmptyAudioManager`.
 * It enables the usage of `load()` and `loadBatch()` in top-level code.
 *
 * @warning
 * ⚠️ Only load() and loadBatch() can be used in top-level code ⚠️
 */
export const globalAudioManager = window.AudioContext
    ? new AudioManager()
    : new EmptyAudioManager();

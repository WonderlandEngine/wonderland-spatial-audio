import {_audioContext, unlockAudioContext} from './audio-listener.js';
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
 * These channels can be utilized to regulate the global volume of audio.
 */
export enum Channel {
    /** Intended for sound effects. Connects to Master Channel. */
    SFX,
    /** Intended for music. Connects to Master Channel. */
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
     */
    position?: Float32Array;
    /** Sets the channel on which the audio will be played */
    channel?: Channel;
};

/**
 * Default number of one-shot players.
 * @todo: Question for Timmy: From your experience, how many one-shots/regular stuff (loops, music, etc) do you
 * typically
 * need?
 */
export const DEF_ONESHT_PLR_COUNT = 16;

/**
 * Default number of regular players.
 */
export const DEF_PLR_COUNT = 16;

/**
 * Manages audio files and players, providing control over playback on three audio channels.
 *
 * @classdesc
 * The AudioManager handles audio files and players, offering control over playback on three distinct channels.
 * It supports two types of players: OneShot players, which play audio once and return, and regular players.
 * OneShot players are less configurable but more performant than regular players.
 * Upon creation, the AudioManager can be configured with the desired number of OneShot and regular players,
 * affecting the maximum number of simultaneous sounds that can play.
 * It is advisable to experiment with player counts to optimize resource usage.
 * @see Channel
 *
 * @example
 * ```js
 * enum Sounds {
 *      Click,
 *      GunShot,
 * }
 *
 * const am = new AudioManager();
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
    /** The emitter will notify all listeners about the PlayState of each ID.
     *
     * @note
     * - READY will be emitted if all sources of a given ID have loaded.
     * - PLAYING / STOPPED are only emitted for IDs that have been started with play()
     * - OneShots won't give status updates.
     *
     * @example
     * ```js
     * audioManager.emitter.add((msg) => {
     *    if (msg.id === Sounds.Click) {
     *          console.log(msg.state);
     *    }
     * });
     * ```
     */
    readonly emitter = new Emitter<[PlayStateWithID]>();

    /* Cache for decoded audio buffers */
    private _bufferCache = new Map<number, AudioBuffer[]>();

    /* Simple, fast cache for one-shot nodes */
    private readonly _oneShotCache: ReadonlyArray<OneShotPlayer>;
    private _oneShotIndex = 0;

    /* Cache for regular nodes */
    private _freePlayers: BufferPlayer[] = [];
    private _busyPlayers = new Map<number, BufferPlayer>();

    private readonly _oneShotCacheSize: number;
    private readonly _masterGain = new GainNode(_audioContext);
    private readonly _musicGain = new GainNode(_audioContext);
    private readonly _sfxGain = new GainNode(_audioContext);
    private _hasOneShotStopped = false;

    /**
     * @overload
     */
    constructor();

    /**
     * @overload
     * @param oneShotPlayerCount Parameter that specifies the amount of one-shot players.
     * @param playerCount Parameter that specifies the amount of regular players.
     */
    constructor(oneShotPlayerCount: number, playerCount: number);

    /**
     * Constructs a AudioManager.
     *
     * Specify here how many players of each kind your project will need.
     *
     * @note If you are unsure how many players of each type you need, run with defaults at first.
     * After a period of heavy use, check the `amountOfFreePlayers()` and `hasStoppedOneShot()` getters of the
     * AudioManager.
     *
     * @warning
     * The combined amount of simultaneously playing audio files on Meta Quest 2 is about 30!
     *
     * @see amountOfFreePlayers
     * @see hasStoppedOneShot
     *
     * @param oneShotPlayerCount Optional parameter that specifies the amount of one-shot players.
     * @param playerCount Optional parameter that specifies the amount of regular players.
     */
    constructor(oneShotPlayerCount = DEF_ONESHT_PLR_COUNT, playerCount = DEF_PLR_COUNT) {
        this._sfxGain.connect(this._masterGain);
        this._musicGain.connect(this._masterGain);
        this._masterGain.connect(_audioContext.destination);
        this._oneShotCacheSize = oneShotPlayerCount;
        this._oneShotCache = this._initOneShotCache(oneShotPlayerCount);

        /* Initialize buffer player cache */
        for (let i = 0; i < playerCount; i++) {
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
     */
    async load(path: string[] | string, id: number) {
        const paths = Array.isArray(path) ? path : [path];
        if (!this._bufferCache.has(id)) {
            this._bufferCache.set(id, []);
        }
        for (let i = 0; i < paths.length; i++) {
            const response = await fetch(paths[i]);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await _audioContext.decodeAudioData(arrayBuffer);
            this._bufferCache.get(id)!.push(audioBuffer);
        }

        this.emitter.notify({id: id, state: PlayState.READY});
    }

    /**
     * Plays the audio file associated with the given ID.
     *
     * @note Is the given ID already playing, it will restart its playback.
     * @param id ID of the file that should be played.
     * @param config Optional parameter that will configure how the audio is played. Is no configuration provided,
     * the audio will play at volume 1.0, without panning and on the MASTER channel.
     * @throws If the given ID does not have a buffer associated with it, or all players are currently occupied.
     */
    async play(id: number, config?: PlayConfig) {
        const buffer = this._bufferCache.get(id);
        if (!buffer) {
            throw `audio-manager: No identifier with number: ${id} found!`;
        }
        const player = this._busyPlayers.get(id) || this._freePlayers.pop();
        if (!player) {
            throw 'audio-manager: Reached maximum number of simultaneously playable sounds!';
        }
        player.stop();
        this._busyPlayers.set(id, player);
        if (_audioContext.state === 'suspended') {
            await unlockAudioContext();
        }
        player.play(buffer, id, config);
        this.emitter.notify({id: id, state: PlayState.PLAYING});
    }

    /**
     * Plays the audio file associated with the given ID until it naturally ends.
     *
     * @note
     * - IDs can be triggered as often as there are one-shot players in the AudioManager.
     * - One shots work with First-In-First-Out principle. If all players are occupied, the manager will stop the
     * one that started playing first, to free up a player for the new ID.
     * //@todo: Question for Timmy: Not sure if SFX will suit most use cases or MASTER is the better choice.
     * - One-shots are always connect to the SFX channel.
     * - One-shots cant loop.
     * - One-shots can only be stopped all at once with stopOneShots()
     *
     * @param id ID of the file that should be played.
     * @param config  Optional parameter that will configure how the audio is played. Note that only the position
     * and volume settings will affect the playback.
     * @throws If the given ID does not have a buffer associated with it.
     */
    async playOneShot(id: number, config?: PlayConfig) {
        const buffers = this._bufferCache.get(id);
        if (!buffers) {
            throw `audio-manager: No identifier with number: ${id} found!`;
        }
        const audioBuffer = buffers[Math.floor(Math.random() * buffers.length)];
        const player = this._oneShotCache[this._oneShotIndex];
        await player.play(audioBuffer, config?.volume || DEF_VOL, config?.position);
        /* Advance cache pointer */
        this._oneShotIndex = (this._oneShotIndex + 1) % this._oneShotCacheSize;
    }

    /**
     * Stops the audio associated with the given ID.
     * @note This does not work for one-shots!
     * @param id
     */
    stop(id: number) {
        this._busyPlayers.get(id)?.stopAndFree();
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
     * @param v Volume that the channel should be set to.
     * @param t Optional time parameter that specifies the time it takes for the channel to reach the specified
     * volume in seconds (Default is 0).
     */
    setGlobalVolume(channel: Channel, v: number, t = 0) {
        const volume = Math.max(MIN_VOLUME, v);
        const time = _audioContext.currentTime + Math.max(MIN_RAMP_TIME, t);
        switch (channel) {
            case Channel.MUSIC:
                this._musicGain.gain.linearRampToValueAtTime(volume, time);
                break;
            case Channel.SFX:
                this._sfxGain.gain.linearRampToValueAtTime(volume, time);
                break;
            default:
                this._masterGain.gain.linearRampToValueAtTime(volume, time);
        }
    }

    /**
     * Removes all decoded audio from the manager that is associated with the given ID.
     *
     * @warning This will stop the playback of the given ID.
     * @param id Identifier of the audio that should be removed.
     */
    remove(id: number) {
        this.stop(id);
        this._bufferCache.delete(id);
    }

    /**
     * Frees a player that was currently playing the given ID.
     *
     * @warning This is for internal use only, use at your own risk!
     * @param id Identifier of previously playing audio.
     */
    _freeUpBusyPlayer(id: number) {
        const player = this._busyPlayers.get(id);
        if (player) {
            this._busyPlayers.delete(id);
            this._freePlayers.push(player);
        }
    }

    /**
     * Gets the current amount of free regular players in the audio manager.
     *
     * @note Use this to check how many resources your current project is actually using, and then optimize the
     * amount of regular players in the AudioManager constructor.
     */
    get amountOfFreePlayers() {
        return this._freePlayers.length;
    }

    /**
     * Checks if a one-shot has been stopped to make room for another.
     *
     * @note This could indicate that there aren't enough one-shot players. Keep in mind though, that it might not
     * be noticeable (and therefore doesn't matter) if the last started one-shot had to stop before its natural end.
     *
     * @returns true if all players were in use at one point and a player had to be stopped to make room for another
     * one-shot.
     */
    get hasStoppedOneShot() {
        return this._hasOneShotStopped;
    }
}

// @todo: Question for Timmy: Not sure if we need to give the user a instance or not. What do you think? It would
//  kind of defeat the purpose of having it configurable in the first place. Or should we come up with reasonable
//  defaults and make it not configurable at all?
let globalAudioManager: AudioManager = null!;
if (window.AudioContext !== undefined) {
    globalAudioManager = new AudioManager();
}

export {globalAudioManager};

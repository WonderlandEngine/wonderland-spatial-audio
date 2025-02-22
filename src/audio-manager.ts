import {_audioContext} from './audio-listener.js';
import {Emitter} from '@wonderlandengine/api';
import {BufferPlayer, DEF_VOL, MIN_RAMP_TIME, MIN_VOLUME} from './audio-players.js';

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
    /** The source is ready to be played */
    Ready,
    /** The source has started playing */
    Playing,
    /** The source has stopped */
    Stopped,
    /** The source has paused */
    Paused,
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
 */
export type PlayConfig = {
    /** Sets the volume of the player (0-1) */
    volume?: number;
    /** Whether to loop the audio */
    loop?: boolean;
    /**
     * Sets the position of the audio source and makes it spatial.
     *
     * @remarks Panned audio will always use HRTF for spatialization.
     * For this to work correctly, the audio-listener needs to be set up!
     */
    position?: Float32Array;
    /** Sets the channel on which the audio will be played. */
    channel?: AudioChannel;
    /**
     * Whether the audio has priority or not. If not, playback can be stopped to free up a player when no others are
     * available.
     */
    priority?: boolean;
    /** Defines the offset in seconds on where to start playing the audio */
    playOffset?: number;
    /** Marks the playback as being a one-shot, @deprecated since >1.2.0 */
    oneShot?: boolean;
};

/**
 * Default number of internal players.
 */
export const DEF_PLAYER_COUNT = 32;
const SHIFT_AMOUNT = 16;
const MAX_NUMBER_OF_INSTANCES = (1 << SHIFT_AMOUNT) - 1;

/**
 * Manages audio files and players, providing control over playback on three audio channels.
 *
 * @classdesc
 * The AudioManager handles audio files and players, offering control over playback on three distinct channels.
 * @see AudioChannel
 *
 * @remarks The AudioManager is able to play audio with spatial positioning. Keep in mind that for this to work
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
export interface IAudioManager {
    /**
     * Decodes and stores the given audio files and associates them with the given ID.
     *
     * @param path Path to the audio files. Can either be a single string or a list of strings.
     * @param id Identifier for the given audio files.
     *
     * @remarks Is there more than one audio file available per id, on playback, they will be selected at random.
     * This enables easy variation of the same sounds!
     *
     * @returns A Promise that resolves when all files are successfully loaded.
     */
    load(path: string[] | string, id: number): void;

    /**
     * Same as load(), but lets you easily load a bunch of files without needing to call the manager everytime.
     *
     * @see load
     *
     * @param pair Pair of source files and associating identifier.
     * Multiple pairs can be provided as separate arguments.
     *
     * @returns A Promise that resolves when all files are successfully loaded.
     */
    loadBatch(...pair: [string[] | string, number][]): void;

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
     * @returns The playId that identifies this specific playback, so it can be stopped or identified in the
     * emitter. If playback could not be started, an invalid playId is returned.
     */
    play(id: number, config?: PlayConfig): number;

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
     *
     * @deprecated since > 1.2.0, use play() instead.
     */
    playOneShot(id: number, config?: PlayConfig): void;

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
    autoplay(id: number, config?: PlayConfig): number;

    /**
     * Stops the audio associated with the given ID.
     *
     * @param playId Specifies the exact audio that should be stopped.
     *
     * @note Obtain the playId from the play() method.
     * @see play
     */
    stop(playId: number): void;

    /**
     * Pauses a playing audio.
     *
     * @param playId Id of the source that should be paused.
     */
    pause(playId: number): void;

    /**
     * Resumes a paused audio.
     *
     * @param playId Id of the source that should be resumed.
     */
    resume(playId: number): void;

    /**
     * Stops playback of all one-shot players.
     * @deprecated since >1.2.0, use  regular play() with stop() instead.
     */
    stopOneShots(): void;

    /**
     * Resumes all paused players.
     */
    resumeAll(): void;

    /**
     * Pauses all playing players.
     */
    pauseAll(): void;

    /**
     * Stops all audio.
     */
    stopAll(): void;

    /**
     * Sets the volume of the given audio channel.
     *
     * @param channel Specifies the audio channel that should be modified.
     * @param volume Volume that the channel should be set to.
     * @param time Optional time parameter that specifies the time it takes for the channel to reach the specified
     * volume in seconds (Default is 0).
     */
    setGlobalVolume(channel: AudioChannel, volume: number, time: number): void;

    /**
     * Removes all decoded audio from the manager that is associated with the given ID.
     *
     * @warning This will stop playback of the given ID.
     * @param id Identifier of the audio that should be removed.
     */
    remove(id: number): void;

    /**
     * Removes all decoded audio from the manager, effectively resetting it.
     *
     * @warning This will stop playback entirely.
     */
    removeAll(): void;

    /**
     * Gets the sourceId of a playId.
     *
     * @param playId of which to get the sourceId from.
     */
    getSourceIdFromPlayId(playId: number): number;

    /**
     * Gets the current amount of free players in the audio manager.
     *
     * @note Use this to check how many resources your current project is using.
     */
    get amountOfFreePlayers(): number;
}

export class AudioManager implements IAudioManager {
    /** The emitter will notify all listeners about the PlayState of a unique ID.
     *
     * @remarks
     * - READY will be emitted if all sources of a given source ID have loaded.
     * - PLAYING / STOPPED / PAUSED are only emitted for play IDs that are returned by the play() method.
     * - If you want to check the status for a source ID, convert the play ID of the message using the
     *   getSourceIdFromPlayId() method.
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

    /**
     * Sets the random function the manager will use for selecting buffers.
     *
     * @remarks Default random function is Math.random()
     * @param func Function that should be used for select the buffer.
     */
    randomBufferSelectFunction: () => number = Math.random;

    /* Cache for decoded audio buffers */
    private _bufferCache: (AudioBuffer[] | undefined)[] = [];

    /* Simple, fast cache for players */
    private _playerCache: BufferPlayer[] = [];
    private _playerCacheIndex = 0;
    private _amountOfFreePlayers = DEF_PLAYER_COUNT;

    /* Counts how many times a sourceId has played. Resets to 0 after {@link MAX_NUMBER_OF_INSTANCES }. */
    private _instanceCounter: number[] = [];

    private _masterGain: GainNode;
    private _musicGain: GainNode;
    private _sfxGain: GainNode;

    private _unlocked = false;
    private _autoplayStorage: [number, PlayConfig | undefined][] = [];

    /**
     * Constructs a AudioManager.
     *
     * Uses the default amount of players.
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

        for (let i = 0; i < DEF_PLAYER_COUNT; i++) {
            this._playerCache.push(new BufferPlayer(this));
        }
    }

    async load(path: string[] | string, id: number) {
        if (id < 0) {
            console.error('audio-manager: Negative IDs are not valid! Skipping ${path}.');
            return;
        }
        const paths = Array.isArray(path) ? path : [path];
        if (!this._bufferCache[id]) {
            this._bufferCache[id] = [];
        }
        this._instanceCounter[id] = -1;
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

    async loadBatch(...pair: [string[] | string, number][]) {
        return Promise.all(pair.map((p) => this.load(p[0], p[1])));
    }

    play(id: number, config?: PlayConfig) {
        if (this._instanceCounter[id] == -1) {
            console.warn(
                `audio-manager: Tried to play audio that is still decoding: ${id}`
            );
            return -1;
        }
        const bufferList = this._bufferCache[id];
        if (!bufferList) {
            console.error(
                `audio-manager: No audio source is associated with identifier: ${id}`
            );
            return -1;
        }
        if (!this._unlocked) {
            return -1;
        }
        const player = this._getAvailablePlayer();
        if (!player) {
            console.warn(
                `audio-manager: All players are busy and no low priority player could be found to free up to play ${id}.`
            );
            return -1;
        }

        const unique_id = this._generateUniqueId(id);

        /* Decode playConfig */
        if (config?.priority) {
            /* Priority players get pushed to the end of the list and cant be retrieved to free up */
            this._amountOfFreePlayers--;
            let index = this._playerCache.indexOf(player);
            this._playerCache.splice(index, 1);
            this._playerCache.push(player);
            player.priority = true;
        } else {
            player.priority = false;
        }
        player.playId = unique_id;
        player.buffer = this._selectRandomBuffer(bufferList);
        player.looping = config?.loop ?? false;
        player.position = config?.position;
        player.playOffset = config?.playOffset ?? 0;
        player.channel = config?.channel ?? AudioChannel.Sfx;
        player.volume = config?.volume ?? DEF_VOL;

        player.play();
        return unique_id;
    }

    private _playWithUniqueId(uniqueId: number, config?: PlayConfig) {
        const id = this.getSourceIdFromPlayId(uniqueId);
        const bufferList = this._bufferCache[id];
        if (!bufferList) {
            console.error(
                `audio-manager: No audio source is associated with identifier: ${id}`
            );
            return;
        }
        const player = this._getAvailablePlayer();
        if (!player) {
            console.warn(
                `audio-manager: All players are busy and no low priority player could be found to free up.`
            );
            return;
        }

        /* Decode playConfig */
        if (config?.priority) {
            /* Priority players get pushed to the end of the list and cant be retrievd to free up */
            this._amountOfFreePlayers--;
            let index = this._playerCache.indexOf(player);
            this._playerCache.splice(index, 1);
            this._playerCache.push(player);
            player.priority = true;
        } else {
            player.priority = false;
        }
        player.playId = uniqueId;
        player.buffer = this._selectRandomBuffer(bufferList);
        player.looping = config?.loop ?? false;
        player.oneShot = config?.oneShot ?? false;
        player.position = config?.position;
        player.playOffset = config?.playOffset ?? 0;
        player.channel = config?.channel ?? AudioChannel.Sfx;
        player.volume = config?.volume ?? DEF_VOL;

        player.play();
    }

    playOneShot(id: number, config?: PlayConfig) {
        if (!config) this.play(id, {oneShot: true});
        config!.loop = false;
        config!.priority = false;
        config!.oneShot = true;
        this.play(id, config);
    }

    /**
     * Advances the _playerCacheIndex and stops the player on that position.
     *
     * @returns A BufferPlayer with PlayState.Stopped, or undefined if no player can be stopped.
     */
    _getAvailablePlayer(): BufferPlayer | undefined {
        if (this._amountOfFreePlayers < 1) return;
        /* Advance cache pointer */
        this._playerCacheIndex = (this._playerCacheIndex + 1) % this._amountOfFreePlayers;
        const player = this._playerCache[this._playerCacheIndex];
        /* Make player available if unavailable */
        player.stop();
        return player;
    }

    autoplay(id: number, config?: PlayConfig): number {
        if (this._unlocked) {
            return this.play(id, config);
        }
        const uniqueId = this._generateUniqueId(id);
        this._autoplayStorage.push([uniqueId, config]);
        return uniqueId;
    }

    stop(playId: number) {
        this._playerCache.forEach((player) => {
            if (player.playId === playId) {
                player.stop();
                return;
            }
        });
    }

    pause(playId: number) {
        this._playerCache.forEach((player) => {
            if (player.playId === playId) {
                player.pause();
                return;
            }
        });
    }

    resume(playId: number) {
        this._playerCache.forEach((player) => {
            if (player.playId === playId) {
                player.resume();
                return;
            }
        });
    }

    stopOneShots() {
        this._playerCache.forEach((player) => {
            if (player.oneShot) {
                player.stop();
                return;
            }
        });
    }

    resumeAll() {
        this._playerCache.forEach((player) => {
            player.resume();
        });
    }

    pauseAll() {
        this._playerCache.forEach((player) => {
            player.pause();
        });
    }

    stopAll() {
        this._playerCache.forEach((player) => {
            player.stop();
        });
    }

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

    remove(id: number) {
        if (id < 0) return;
        this.stop(id);
        this._bufferCache[id] = undefined;
        this._instanceCounter[id] = -1;
    }

    removeAll() {
        this.stopAll();
        this._bufferCache.length = 0;
        this._instanceCounter.length = 0;
    }

    getSourceIdFromPlayId(playId: number) {
        return playId >> SHIFT_AMOUNT;
    }

    get amountOfFreePlayers() {
        return this._amountOfFreePlayers;
    }

    private _selectRandomBuffer(bufferList: AudioBuffer[]) {
        return bufferList[
            Math.floor(this.randomBufferSelectFunction() * bufferList.length)
        ];
    }

    private _generateUniqueId(id: number) {
        let instanceCount = this._instanceCounter[id];
        if (!instanceCount) instanceCount = 0;
        else if (instanceCount === -1) return -1;
        const unique_id = (id << SHIFT_AMOUNT) + instanceCount;
        this._instanceCounter[id] = (instanceCount + 1) % MAX_NUMBER_OF_INSTANCES;
        return unique_id;
    }

    /**
     * @warning This function is for internal use only!
     */
    _returnPriorityPlayer(player: BufferPlayer) {
        if (!player.priority) return;
        /* We start looking from the back, because priority players are always in the back */
        for (let i = this._playerCache.length - 1; i >= 0; i--) {
            if (this._playerCache[i] === player) {
                this._playerCache.splice(i, 1);
                this._playerCache.unshift(player);
                this._amountOfFreePlayers++;
                return;
            }
        }
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

export class EmptyAudioManager implements IAudioManager {
    async load(path: string[] | string, id: number) {}
    async loadBatch(...pair: [string[] | string, number][]) {}
    play(id: number, config?: PlayConfig) {
        return -1;
    }
    playOneShot(id: number, config?: PlayConfig) {}
    autoplay(id: number, config?: PlayConfig) {
        return -1;
    }
    stop(playId: number) {}
    pause(playId: number) {}
    resume(playId: number) {}
    stopOneShots() {}
    resumeAll() {}
    pauseAll() {}
    stopAll() {}
    setGlobalVolume(channel: AudioChannel, volume: number, time: number) {}
    remove(id: number) {}
    removeAll() {}
    getSourceIdFromPlayId(playId: number) {
        return -1;
    }
    get amountOfFreePlayers() {
        return -1;
    }
}

/**
 * Global instance of a AudioManager.
 *
 * @remarks
 * To construct an AudioManager, the WebAudio API is needed. For non-browser environments, like during the packaging
 * step of the wonderland editor, the globalAudioManager is set to an `EmptyAudioManager`.
 * It enables the usage of `load()` and `loadBatch()` in top-level code.
 *
 * @warning
 * ⚠️ Only load() and loadBatch() can be used in top-level code ⚠️
 */
export const globalAudioManager: IAudioManager = window.AudioContext
    ? new AudioManager()
    : new EmptyAudioManager();

import {_audioContext} from './audio-listener.js';
import {Emitter} from '@wonderlandengine/api';
import {BufferPlayer, MIN_RAMP_TIME, MIN_VOLUME, OneShotNode} from './audio-player.js';

export enum Channel {
    SFX,
    MUSIC,
    MASTER,
}

export type PlayConfig = {
    volume?: number;
    loop?: boolean;
    position?: Float32Array;
    audioChannel?: Channel;
};

export enum PlayState {
    /* The source is ready to be played */
    READY,
    /* The source has started playing */
    PLAYING,
    /* The source has stopped */
    STOPPED,
}

type PlayStateWithID = {
    id: number;
    state: PlayState;
};

const ONESHOT_CACHE_SIZE = 16;
const PLAYER_COUNT = 16;
export const DEF_VOL = 1.0;

export class AudioManager {
    readonly emitter = new Emitter<[PlayStateWithID]>();

    /* Cache for decoded audio buffers */
    private _bufferCache = new Map<number, AudioBuffer[]>();

    /* Simple, fast cache for one shot nodes */
    private readonly _oneShotCache: ReadonlyArray<OneShotNode>;
    private _oneShotIndex = 0;

    /* Cache for regular nodes */
    private _freePlayers: BufferPlayer[] = [];
    private _busyPlayers = new Map<number, BufferPlayer>();

    private readonly _oneShotCacheSize: number;
    private readonly _masterGain = new GainNode(_audioContext);
    private readonly _musicGain = new GainNode(_audioContext);
    private readonly _sfxGain = new GainNode(_audioContext);
    private _hasOneShotStopped = false;

    constructor(oneShotCacheSize: number, playerCount: number) {
        this._sfxGain.connect(this._masterGain);
        this._musicGain.connect(this._masterGain);
        this._masterGain.connect(_audioContext.destination);
        this._oneShotCacheSize = oneShotCacheSize;
        this._oneShotCache = this._initOneShotCache(oneShotCacheSize);

        /* Initialize buffer player cache */
        for (let i = 0; i < playerCount; i++) {
            this._freePlayers[i] = new BufferPlayer(this);
        }
    }

    private _initOneShotCache(size: number) {
        const cache: OneShotNode[] = [];
        for (let i = 0; i < size; i++) {
            cache[i] = new OneShotNode(this);
        }
        return cache;
    }

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
            await this._unlockAudioContext();
        }
        player.play(buffer, id, config);
        this.emitter.notify({id: id, state: PlayState.PLAYING});
    }

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

    stop(id: number) {
        this._busyPlayers.get(id)?.stopAndFree();
    }

    stopOneShots() {
        for (const node of this._oneShotCache) {
            node.stop();
        }
    }

    stopAll() {
        this.stopOneShots();
        this._busyPlayers.forEach((value) => {
            value.stopAndFree();
        });
    }

    setGlobalVolume(type: Channel, v: number, t = 0) {
        const volume = Math.max(MIN_VOLUME, v);
        const time = _audioContext.currentTime + Math.max(MIN_RAMP_TIME, t);
        switch (type) {
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

    remove(id: number) {
        this.stop(id);
        this._bufferCache.delete(id);
    }

    _freeUpBusyPlayer(id: number) {
        const player = this._busyPlayers.get(id);
        if (player) {
            this._busyPlayers.delete(id);
            this._freePlayers.push(player);
        }
    }

    /**
     * Unlocks the WebAudio AudioContext.
     *
     * @returns a promise that fulfills when the audioContext resumes.
     * @note WebAudio AudioContext only resumes on user interaction.
     * @warning This is for internal use only, use at own risk!
     */
    async _unlockAudioContext(): Promise<void> {
        return new Promise<void>((resolve) => {
            const unlockHandler = () => {
                _audioContext.resume().then(() => {
                    window.removeEventListener('click', unlockHandler);
                    window.removeEventListener('touch', unlockHandler);
                    window.removeEventListener('keydown', unlockHandler);
                    window.removeEventListener('mousedown', unlockHandler);
                    resolve();
                });
            };

            window.addEventListener('click', unlockHandler);
            window.addEventListener('touch', unlockHandler);
            window.addEventListener('keydown', unlockHandler);
            window.addEventListener('mousedown', unlockHandler);
        });
    }

    get amountOfFreePlayers() {
        return this._freePlayers.length;
    }

    get hasStoppedOneShot() {
        return this._hasOneShotStopped;
    }
}

/** @todo: Question for Timmy:
 * Not sure if we need to give the user a instance or not. What do you think?
 */
let globalAudioManager: AudioManager = null!;
if (window.AudioContext !== undefined) {
    globalAudioManager = new AudioManager(ONESHOT_CACHE_SIZE, PLAYER_COUNT);
}

export {globalAudioManager};

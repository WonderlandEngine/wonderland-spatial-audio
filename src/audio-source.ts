import {Component, Emitter, WonderlandEngine} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {_audioContext, AudioListener, _unlockAudioContext} from './audio-listener.js';
import {AudioChannel, AudioManager, PlayState} from './audio-manager.js';
import {MIN_RAMP_TIME, MIN_VOLUME} from './audio-players.js';

export enum PanningType {
    None,
    Regular,
    Hrtf,
}

interface AudioFile {
    referenceCount: number;
    buffer: Promise<AudioBuffer>;
}

/**
 * Constants
 */
const posVec = new Float32Array(3);
const oriVec = new Float32Array(3);
const distanceModels = ['linear', 'exponential', 'inverse'];

const bufferCache = new Map<string, AudioFile>();

/**
 * Loads the given audio into a AudioBuffer.
 *
 * @param source Path to the file that should be decoded
 * @returns A Promise that fulfills once the audio is decoded
 */
export async function loadAudio(source: string): Promise<AudioBuffer> {
    const response = await fetch(source);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await _audioContext.decodeAudioData(arrayBuffer);
    return buffer;
}

/**
 * Adds the specified file to cache.
 * @param source Path to the file that should be added to cache.
 * @warning This is for internal use only, use at own risk!
 */
async function addBufferToCache(source: string): Promise<AudioBuffer> {
    let audio: AudioFile;
    if (bufferCache.has(source)) {
        audio = bufferCache.get(source)!;
        audio.referenceCount += 1;
    } else {
        audio = {
            referenceCount: 1,
            buffer: loadAudio(source), // Delay await until bufferCache is set, to avoid subsequent calls with same source to start decoding
        };
        bufferCache.set(source, audio);
    }
    return await audio.buffer;
}

/**
 * Removes the specified file from cache.
 *
 * @param source Path to the file that should be evicted from cache.
 * @warning This is for internal use only, use at own risk!
 */
function removeBufferFromCache(source: string) {
    if (!bufferCache.has(source)) {
        return;
    }
    const audioFile = bufferCache.get(source)!;
    if (audioFile.referenceCount > 1) {
        audioFile.referenceCount -= 1;
    } else {
        bufferCache.delete(source);
    }
}

/**
 * Represents an audio src in the Wonderland Engine, allowing playback of audio files.
 */
export class AudioSource extends Component {
    /**
     * The type name for this component.
     */
    static TypeName = 'audio-source';

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(AudioListener);
    }

    /** Path to the audio file that should be played. */
    @property.string()
    src!: string;

    /**
     * Volume of the audio source.
     *
     * @remarks This will only take effect audio that has not started playing yet. Is the audio already playing, use
     * setVolumeDuringPlayback()
     * @see setVolumeDuringPlayback
     */
    @property.float(1.0)
    volume!: number;

    /** Whether to loop the sound. */
    @property.bool(false)
    loop!: boolean;

    /** Whether to autoplay the sound. */
    @property.bool(false)
    autoplay!: boolean;

    /**
     * Select the panning method.
     *
     * @warning Enabling HRTF (Head-Related Transfer Function) is computationally more intensive than regular panning!
     */
    @property.enum(['none', 'panning', 'hrtf'], PanningType.Regular)
    spatial!: PanningType;

    /**
     * Set this property if the object will never move.
     * Disabling position updates each frame saves CPU time.
     */
    @property.bool(false)
    isStationary!: boolean;

    /** The distance model used for spatial audio. */
    @property.enum(['linear', 'inverse', 'exponential'], 'exponential')
    distanceModel!: DistanceModelType;

    /** The maximum distance for audio falloff. */
    @property.float(10000)
    maxDistance!: number;

    /** The reference distance for audio falloff. */
    @property.float(1.0)
    refDistance!: number;

    /** The rolloff factor for audio falloff. */
    @property.float(1.0)
    rolloffFactor!: number;

    /** The inner angle of the audio cone. */
    @property.float(360)
    coneInnerAngle!: number;

    /** The outer angle of the audio cone. */
    @property.float(0)
    coneOuterAngle!: number;

    /** The outer gain of the audio cone. */
    @property.float(0)
    coneOuterGain!: number;

    /**
     * The emitter will notify all subscribers when a state change occurs.
     * @see PlayState
     */
    readonly emitter = new Emitter<[PlayState]>();

    private _pannerOptions: PannerOptions = {};
    private _buffer!: AudioBuffer;
    private _pannerNode = new PannerNode(_audioContext);
    private _audioNode = new AudioBufferSourceNode(_audioContext);
    private _playState: PlayState = PlayState.Ready;
    private _time = 0;
    private _lastPlayStartTime = 0;
    private _playOffset = 0;

    private readonly _gainNode = new GainNode(_audioContext);

    /**
     * Initializes the audio src component.
     * If `autoplay` is enabled, the audio will start playing as soon as the file is loaded.
     */
    async start() {
        this._gainNode.connect(_audioContext.destination);
        if (this.src !== '') {
            this._buffer = await addBufferToCache(this.src);
            this.emitter.notify(PlayState.Ready);
            if (this.autoplay) {
                this.play();
            }
        }
    }

    setAudioChannel(am: AudioManager, channel: AudioChannel) {
        this.stop();
        switch (channel) {
            case AudioChannel.Music:
                this._gainNode.disconnect();
                this._gainNode.connect(am['_musicGain']);
                break;
            case AudioChannel.Sfx:
                this._gainNode.disconnect();
                this._gainNode.connect(am['_sfxGain']);
                break;
            case AudioChannel.Master:
                this._gainNode.disconnect();
                this._gainNode.connect(am['_masterGain']);
                break;
            default:
                return;
        }
    }

    /**
     * Plays the audio associated with this audio src.
     *
     * @param buffer Optional parameter that will set the raw audio buffer that should be played. Defaults to internal audio buffer that is set with given audio path.
     * @remarks Is this audio-source currently playing, playback will be restarted.
     */
    async play(buffer: AudioBuffer = this._buffer) {
        if (this._playState == PlayState.Playing) {
            this.stop();
        } else if (_audioContext.state === 'suspended') {
            await _unlockAudioContext();
        }
        this._gainNode.gain.value = this.volume;
        this._audioNode.buffer = buffer;
        this._audioNode.loop = this.loop;
        if (!this.spatial) {
            this._audioNode.connect(this._gainNode);
        } else {
            this._updateSettings();
            /* PannerNodes can't be reused, as they will play at their last position for a short period */
            this._pannerNode = new PannerNode(_audioContext, this._pannerOptions);
            this._audioNode.connect(this._pannerNode).connect(this._gainNode);
        }
        this._audioNode.start(0, this._playOffset);
        this._lastPlayStartTime = _audioContext.currentTime;
        this._audioNode.onended = () => this.stop();
        this._playState = PlayState.Playing;
        if (!this.isStationary) {
            this.update = this._update.bind(this);
        }
        this.emitter.notify(PlayState.Playing);
    }

    /**
     * Stops the audio associated with this audio src.
     */
    stop() {
        if (this._playState != PlayState.Playing) return;
        this._playState = PlayState.Stopped;
        this._audioNode.onended = null;
        this._audioNode.stop();
        this.update = undefined;
        this._audioNode.disconnect();
        this._pannerNode.disconnect();
        this._audioNode = new AudioBufferSourceNode(_audioContext);
        this._playOffset = 0;
        this.emitter.notify(PlayState.Stopped);
    }

    /**
     * Pauses the audio associated with this audio src.
     */
    pause() {
        if (this._playState !== PlayState.Playing) return;
        this._playOffset += _audioContext.currentTime - this._lastPlayStartTime;
        this._audioNode.onended = null;
        this._audioNode.stop();
        this._audioNode.disconnect();
        this._pannerNode.disconnect();
        this._audioNode = new AudioBufferSourceNode(_audioContext);
        this._playState = PlayState.Paused;
        this.emitter.notify(PlayState.Paused);
    }

    /**
     * Resumes the audio associated with this audio src.
     */
    resume() {
        if (this._playState == PlayState.Paused) {
            this.play();
        }
    }

    /**
     * Checks if the audio src is currently playing.
     */
    get isPlaying(): boolean {
        return this._playState == PlayState.Playing;
    }

    /**
     * Changes the volume during playback.
     * @param v Volume that source should have.
     * @param t Optional parameter that specifies the time it takes for the volume to reach its specified value in
     * seconds (Default is 0).
     */
    setVolumeDuringPlayback(v: number, t = 0) {
        const volume = Math.max(MIN_VOLUME, v);
        const time = _audioContext.currentTime + Math.max(MIN_RAMP_TIME, t);
        this._gainNode.gain.linearRampToValueAtTime(volume, time);
    }

    /**
     * Change out the source.
     *
     * @param path Path to the audio file.
     */
    async changeAudioSource(path: string) {
        this._buffer = await addBufferToCache(path);
        removeBufferFromCache(this.src);
        this.src = path;
    }

    /**
     * Called when the component is deactivated.
     * Stops the audio playback.
     */
    onDeactivate() {
        this.stop();
    }

    /**
     * Called when the component is destroyed.
     * Stops the audio playback and removes the src from cache.
     */
    onDestroy() {
        this.stop();
        this._gainNode.disconnect();
        removeBufferFromCache(this.src);
    }

    private _update(dt: number) {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);

        this._time = _audioContext.currentTime + dt;
        this._pannerNode.positionX.linearRampToValueAtTime(posVec[0], this._time);
        this._pannerNode.positionY.linearRampToValueAtTime(posVec[2], this._time);
        this._pannerNode.positionZ.linearRampToValueAtTime(-posVec[1], this._time);
        this._pannerNode.orientationX.linearRampToValueAtTime(oriVec[0], this._time);
        this._pannerNode.orientationY.linearRampToValueAtTime(oriVec[2], this._time);
        this._pannerNode.orientationZ.linearRampToValueAtTime(-oriVec[1], this._time);
    }

    /**
     * @deprecated Use {@link #volume} instead
     */
    set maxVolume(v: number) {
        this.volume = v;
    }

    /**
     * @deprecated Use {@link #volume} instead
     */
    get maxVolume() {
        return this.volume;
    }

    private _updateSettings() {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);
        this._pannerOptions = {
            coneInnerAngle: this.coneInnerAngle,
            coneOuterAngle: this.coneOuterAngle,
            coneOuterGain: this.coneOuterGain,
            distanceModel: this._distanceModelSelector(),
            maxDistance: this.maxDistance,
            refDistance: this.refDistance,
            rolloffFactor: this.rolloffFactor,
            panningModel: this.spatial === PanningType.Hrtf ? 'HRTF' : 'equalpower',
            positionX: posVec[0],
            positionY: posVec[2],
            positionZ: -posVec[1],
            orientationX: oriVec[0],
            orientationY: oriVec[2],
            orientationZ: -oriVec[1],
        };
    }

    private _distanceModelSelector(): DistanceModelType {
        if (distanceModels.includes(this.distanceModel)) {
            return this.distanceModel as DistanceModelType;
        }
        return 'exponential';
    }
}

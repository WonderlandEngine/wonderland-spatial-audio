import {_audioContext} from './audio-listener.js';
import {AudioChannel, AudioManager, PlayState} from './audio-manager.js';

/* Ramp times of 0 cause a click, 5 ms should be sufficient */
export const MIN_RAMP_TIME = 5 / 1000;
/* Needed because WebAudio ramp function doesn't accept 0 as valid volume */
export const MIN_VOLUME = 0.001;

export const DEF_VOL = 1.0;

const DEFAULT_PANNER_CONFIG: PannerOptions = {
    coneInnerAngle: 360,
    coneOuterAngle: 0,
    coneOuterGain: 0,
    distanceModel: 'exponential' as DistanceModelType,
    maxDistance: 10000,
    refDistance: 1.0,
    rolloffFactor: 1.0,
    panningModel: 'HRTF',
    positionX: 0,
    positionY: 0,
    positionZ: 1,
    orientationX: 0,
    orientationY: 0,
    orientationZ: 1,
};

export class BufferPlayer {
    playId = -1;
    buffer: AudioBuffer = _audioContext!.createBuffer(
        1,
        _audioContext!.sampleRate,
        _audioContext!.sampleRate
    );
    looping = false;
    position: Float32Array | undefined;
    priority = false;
    playOffset = 0;
    channel = AudioChannel.Sfx;
    volume = DEF_VOL;
    oneShot = false;

    _gainNode = new GainNode(_audioContext);
    _pannerNode = new PannerNode(_audioContext, DEFAULT_PANNER_CONFIG);
    _audioNode = new AudioBufferSourceNode(_audioContext);
    _pannerOptions = DEFAULT_PANNER_CONFIG;
    _playState = PlayState.Stopped;
    _timeStamp = 0;

    private readonly _audioManager: AudioManager;

    /**
     * Constructs a BufferPlayer.
     *
     * @warning This is for internal use only. BufferPlayer's should only be created and used inside the AudioManager.
     * @param audioManager Manager that manages this player.
     */
    constructor(audioManager: AudioManager) {
        this._audioManager = audioManager;
    }

    play() {
        if (this._playState === PlayState.Playing) {
            this.stop();
        }
        switch (this.channel) {
            case AudioChannel.Music:
                this._gainNode.connect(this._audioManager['_musicGain']);
                break;
            case AudioChannel.Master:
                this._gainNode.connect(this._audioManager['_masterGain']);
                break;
            default:
                this._gainNode.connect(this._audioManager['_sfxGain']);
        }
        this._gainNode.gain.value = this.volume;
        this._audioNode.buffer = this.buffer;
        this._audioNode.loop = this.looping;
        if (this.position) {
            this._pannerOptions.positionX = this.position[0];
            this._pannerOptions.positionY = this.position[2];
            this._pannerOptions.positionZ = -this.position[1];
            /* This is a workaround! We cant re-use panner nodes because they don't update fast enough when
             reconnecting */
            this._pannerNode = new PannerNode(_audioContext, this._pannerOptions);
            this._audioNode.connect(this._pannerNode).connect(this._gainNode);
        } else {
            this._audioNode.connect(this._gainNode);
        }
        this._audioNode.start(0, this.playOffset);
        this._timeStamp = _audioContext.currentTime - this.playOffset;
        this._audioNode.onended = () => this.stop();
        this._playState = PlayState.Playing;
        this.emitState();
    }

    emitState() {
        this._audioManager.emitter.notify({id: this.playId, state: this._playState});
    }

    /**
     * Stops current playback and sends notification on the audio managers emitter.
     */
    stop() {
        if (this._playState === PlayState.Stopped) return;
        this._resetWebAudioNodes();
        if (this.priority) {
            this._audioManager._returnPriorityPlayer(this);
        }
        this._playState = PlayState.Stopped;
        this.emitState();
    }

    pause() {
        if (this._playState !== PlayState.Playing) return;
        this.playOffset =
            (_audioContext.currentTime - this._timeStamp) % this.buffer.duration;
        this._resetWebAudioNodes();
        this._playState = PlayState.Paused;
        this.emitState();
    }

    resume() {
        if (this._playState !== PlayState.Paused) return;
        this.play();
    }

    _resetWebAudioNodes() {
        this._audioNode.onended = null;
        this._audioNode.stop();
        this._audioNode.disconnect();
        this._pannerNode.disconnect();
        this._gainNode.disconnect();
        this._audioNode = new AudioBufferSourceNode(_audioContext);
    }
}

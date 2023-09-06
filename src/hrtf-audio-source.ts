import {Component, Emitter} from '@wonderlandengine/api';
import {getAudioMixer} from './hrft-audio-mixer.js';
import {property} from '@wonderlandengine/api/decorators.js';

const tempVec = new Float32Array(3);

/**
 * Adds a audio source to the HrftAudioMixer and saves its audioID.
 */
export class HrtfAudioSource extends Component {
    static TypeName = 'hrtf-audio-source';

    @property.string()
    audioFile!: string;

    @property.float(1.0)
    volume!: number;

    onEnded = new Emitter();
    private audioID: number = -1;

    async start() {
        this.volume = Math.min(this.volume, 1.0);
        this.audioID = await getAudioMixer().addSource(
            this.audioFile,
            this.object.getPositionWorld(tempVec),
            this.volume
        );
        this.update = this._update.bind(this);
    }

    /**
     * Play the audio that is connected to the stored audioID
     */
    async play() {
        /* Positions do not get updated if audio is not playing, so we need to
         * update the position here once with the specialUpdate flag enabled. */
        getAudioMixer().updatePosition(
            this.audioID,
            this.object.getPositionWorld(tempVec),
            true
        );
        getAudioMixer().playAudio(this.audioID);
    }

    /**
     * Stop the audio that is connected to the stored audioID
     */
    stop() {
        getAudioMixer().stopAudio(this.audioID);
    }

    /**
     * Check if the audio is currently playing
     *
     * @returns {true} if the audio is playing
     */
    isPlaying() {
        return getAudioMixer().isPlaying(this.audioID);
    }

    private _update() {
        getAudioMixer().updatePosition(this.audioID, this.object.getPositionWorld(tempVec));
    }
}

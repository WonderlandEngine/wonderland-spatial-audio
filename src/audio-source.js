import {Component, Property, Emitter} from '@wonderlandengine/api';
import { getAudioMixer } from './audio-mixer';

const tempVec = new Float32Array(3);

/**
 * source
 */
export class AudioSource extends Component {
    static TypeName = 'audio-source';
    /* Properties that are configurable in the editor */
    static Properties = {
        file: Property.string(),
        maxVol: Property.float(1.0),
        maxAudibleDist: Property.int(5),

    };

    onEnded = new Emitter();

    async start() {
        this.audioID = await getAudioMixer().addSource(this.file, this.object.getPositionWorld(tempVec));
        this.update = this._update.bind(this);
    }

    play() {
        getAudioMixer().playAudio(this.audioID).addEventListener('ended', this.onEnded.notify.bind(this.onEnded));
    }

    _update(dt) {
        getAudioMixer().updatePosition(this.audioID, this.object.getPositionWorld(tempVec));
    }

}

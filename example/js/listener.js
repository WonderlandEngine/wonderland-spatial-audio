import {Component, Property} from '@wonderlandengine/api';
import { HRTFContainer } from './hrtf';
import { getAudioMixer } from "./audio-mixer";

/**
 * listener
 */
export class Listener extends Component {
    static TypeName = 'listener';
    /* Properties that are configurable in the editor */
    static Properties = {
    };

    onActivate() {
        this.audioMixer = getAudioMixer();
        this.audioMixer.setListener(this.object);
    }
}

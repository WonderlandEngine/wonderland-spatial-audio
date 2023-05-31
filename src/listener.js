import {Component} from '@wonderlandengine/api';
import { getAudioMixer } from "./audio-mixer.ts";

/**
 * listener
 */
export class Listener extends Component {
    static TypeName = 'listener';
    static Properties = {
    };

    onActivate() {
        this.audioMixer = getAudioMixer();
        this.audioMixer.setListener(this.object);
    }
}

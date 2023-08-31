import {Component} from '@wonderlandengine/api';
import {AudioMixer, getAudioMixer} from './audio-mixer.js';

/**
 * listener
 */
export class Listener extends Component {
    static TypeName = 'listener';
    static Properties = {};
    private audioMixer: AudioMixer | undefined = undefined;

    onActivate() {
        this.audioMixer = getAudioMixer();
        this.audioMixer.setListener(this.object);
    }
}

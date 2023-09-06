import {Component} from '@wonderlandengine/api';
import {HrftAudioMixer, getAudioMixer} from './hrft-audio-mixer.js';

/**
 * listener
 */
export class HrtfListener extends Component {
    static TypeName = 'hrtf-listener';
    static Properties = {};
    private audioMixer: HrftAudioMixer | undefined = undefined;

    onActivate() {
        this.audioMixer = getAudioMixer();
        this.audioMixer.setListener(this.object);
    }
}

import {Component, Property} from '@wonderlandengine/api';
import {HRTFContainer, HRTFPanner, cartesianToInteraural} from './hrtf.js';

/**
 * panner
 */
export class Panner extends Component {
    static TypeName = 'panner';
    /* Properties that are configurable in the editor */
    static Properties = {
        listener: Property.object()
    };
    /* Add other component types here that your component may
     * create. They will be registered with this component */
    static Dependencies = [];

    init() { 
    }

    async start() {
        const audioContext = new AudioContext();
        this.sourceNode = audioContext.createBufferSource();
        const audioData = await getAudioData('thump.mp3', audioContext);
        this.sourceNode.buffer = audioData;

	    var gain = audioContext.createGain();
	    gain.gain.value = 0.3;
	    this.sourceNode.connect(gain);
        this.hrtfContainer = new HRTFContainer();
        await this.hrtfContainer.loadHrir('kemar_L.bin');
        this.panner = new HRTFPanner(audioContext, gain, this.hrtfContainer);
        this.panner.connect(audioContext.destination);
        let rigidBody = this.object.getComponent('physx');
        rigidBody.onCollision(function (type) {
          // Ignore uncollides
          //if (type == CollisionEventType.TouchLost) return;
          if (!this.sourceNode) return;
          /* Print the message that was configured in the editor) */
          this.sourceNode.start();
          this.playing = true;
        }.bind(this));
        this.update = this._update.bind(this);
    }


    _update(dt) {
        //if(!this.playing) return;
        var relativePosition = new Float32Array(3);
        this.listener.transformPointInverseWorld(relativePosition, this.object.getPositionWorld());
        var cords = cartesianToInteraural(relativePosition[0], relativePosition[1], relativePosition[2]);
		this.panner.update(cords.azm, cords.elv);
    }
}
async function getAudioData(file, audioContext) {
    const response = await fetch(file);
    const buffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(buffer)
  }
  

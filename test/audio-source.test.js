import {expect} from '@esm-bundle/chai';

import {init} from './setup.js';
import {AudioSource} from '../dist/index.js';

before(init);

before(() => {
    WL.registerComponent(AudioSource);
});

describe('AudioSource', function () {
    it('properties', function () {
        expect(AudioSource.Properties).to.have.keys([
            'autoplay',
            'coneInnerAngle',
            'coneOuterAngle',
            'coneOuterGain',
            'distanceModel',
            'isStationary',
            'loop',
            'maxDistance',
            'maxVolume',
            'refDistance',
            'rolloffFactor',
            'spatial',
            'src',
        ]);
    });

    it('defaults', function () {
        const audioObject = WL.scene.addObject();
        audioObject.name = 'o';

        let source = audioObject.addComponent(AudioSource, {});

        source = audioObject.addComponent(AudioSource, {
            src: 'audio-files/welcome.wav',
        });

        expect(source).to.not.be.null;
        expect(source.src).to.equal('audio-files/welcome.wav');
        expect(source.maxVolume).to.equal(1.0);
    });
});

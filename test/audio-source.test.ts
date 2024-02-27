import {expect} from '@esm-bundle/chai';

import {init} from './setup.js';
import {AudioSource} from '../dist';

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
            'volume',
            'refDistance',
            'rolloffFactor',
            'spatial',
            'src',
        ]);
    });

    it('defaults', function () {
        const audioObject = WL.scene.addObject();
        audioObject.name = 'o';

        const audio = audioObject.addComponent(AudioSource, {
            src: 'test/resources/welcome.wav',
        });

        expect(audio).to.not.be.null;
        expect(audio.src).to.equal('test/resources/welcome.wav');
        expect(audio.volume).to.equal(1.0);
    });
});

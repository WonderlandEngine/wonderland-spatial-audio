// audio-manager.spec.ts

import {expect} from '@esm-bundle/chai';
import {AudioManager} from '../dist';
import {_audioContext} from '../dist/audio-listener';
import {expectSuccess} from './chai/promise';

/* Audio sources */
const SRC_WELCOME = 'test/resources/welcome.wav'; // Adjust the source path as needed

let audioManager: AudioManager;

describe('AudioManager', () => {

    beforeEach(() => {
        audioManager = new AudioManager();
    });

    it('should be able to create nodes, add and remove files', async () => {
        const playableNode = await audioManager.load(SRC_WELCOME);

        await audioManager._add(SRC_WELCOME);

        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.true;
        expect(playableNode).to.exist;
        audioManager._remove(SRC_WELCOME);
        /* There should be two references, so first remove should still contain the file */
        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.true;
        audioManager._remove(SRC_WELCOME);
        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.false;
    });

    it('should be able to maintain multiple references to the same file', async () => {
        const p1 = await audioManager.load(SRC_WELCOME);
        expect(audioManager['_bufferCache'].size).to.equal(1);
        expect(audioManager['_bufferCache'].get(SRC_WELCOME)[1]).to.equal(1);
        const p2 = await audioManager.load(SRC_WELCOME);
        const p3 = await audioManager.load(SRC_WELCOME);
        const p4 = await audioManager.load(SRC_WELCOME);

        expect(audioManager['_bufferCache'].size).to.equal(1);
        expect(audioManager['_bufferCache'].get(SRC_WELCOME)[1]).to.equal(4);
        expect(audioManager['_bufferCache'].get(SRC_WELCOME)[0]).to.instanceOf(AudioBuffer);

        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.true;
        p1.destroy();
        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.true;
        p3.destroy();
        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.true;
        p2.destroy();
        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.true;
        p4.destroy();
        expect(audioManager['_bufferCache'].has(SRC_WELCOME)).to.be.false;
    });
});

describe('PlayableNode', () => {
    it('should be able to play sound', async () => {
        const audio = await audioManager.load(SRC_WELCOME);

        expectSuccess(audio.play()).then(() => {
            expect(audio.isPlaying).to.be.true;
            expect(_audioContext.state).to.equal('running');
            audio.stop();
            expect(audio['_isPlaying']).to.be.false;
        });
    });
});

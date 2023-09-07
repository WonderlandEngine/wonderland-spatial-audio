/**
 * Efficiently manages WebAudio nodes, freeing up and reusing nodes when possible.
 *
 * @version 1.0
 * @license MIT
 * @author Wonderland GmbH
 */

/**
 * Constants
 */
const SAMPLE_RATE = 48000;
const audioBuffers: { [key: string]: Promise<AudioBuffer> } = {};
const pannerNodes: (PannerNode | undefined)[] = [];
const audioNodes: AudioBufferSourceNode[] = [];
/**
 * If a given ID is valid, it contains a filename; otherwise, it contains an empty string.
 */
const idList: string[] = [];

/**
 * Variables
 */
let _audioContext: AudioContext = null!;
if (window.AudioContext !== undefined) {
    _audioContext = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: SAMPLE_RATE,
    });
}

export { _audioContext };

/**
 * Decodes the provided audio file into a buffer and creates an ID associated with it.
 *
 * @param {string} audioFilePath - Path to the audio file that should be registered.
 * @returns {Promise<number>} A promise containing the ID on success.
 */
export async function registerNewSource(audioFilePath: string) {
    try {
        await getAudioData(audioFilePath);
        // Check for available, unused IDs.
        const id = idList.includes('') ? idList.indexOf('') : idList.length;

        idList[id] = audioFilePath;
        pannerNodes[id] = undefined;

        return id;
    } catch {
        return Promise.reject(
            `Wonderland Audio Manager: registerNewSource() failed. Unable to decode provided file "${audioFilePath}"`
        );
    }
}

/**
 * Creates a playable node with the audio buffer associated with the provided ID.
 *
 * @param {number} id - ID of the registered audio file.
 * @param {PannerOptions} settings - Options on how the PannerNode should be configured.
 * @param {boolean} [loop=false] - Whether to loop the audio or not.
 * @returns {Promise<AudioBufferSourceNode>} A promise containing a playable WebAudio AudioNode on success.
 */
export async function createPlayableNode(id: number, settings: PannerOptions, loop = false) {
    if (id >= idList.length) {
        return Promise.reject(
            `Wonderland Audio Manager: createPlayableNode() failed. The given ID "${id}" was not registered!`
        );
    }
    const file = idList[id];
    if (file === '') {
        return Promise.reject(
            `Wonderland Audio Manager: createPlayableNode() failed. The given ID "${id}" was removed!`
        );
    }
    const audioNode = new AudioBufferSourceNode(_audioContext, {
        buffer: await audioBuffers[file],
        loop: loop,
    });
    const pannerNode = new PannerNode(_audioContext, settings);
    audioNodes[id] = audioNode;
    pannerNodes[id] = pannerNode;

    audioNode.connect(pannerNode).connect(_audioContext.destination);
    // Make sure to free up WebAudio resources when the audio finishes playing.
    audioNode.addEventListener('ended', () => {
        audioNode.disconnect();
        pannerNode.disconnect();
        pannerNodes[id] = undefined;
    });
    return audioNode;
}

/**
 * Updates the position of a given audio source.
 *
 * @param {number} id - ID of the audio source that needs updating.
 * @param {Float32Array} pos - Position in world space of the source.
 * @param {Float32Array} ori - Forward orientation in world space of the audio source.
 * @param {number} dt - Time in seconds until positioning is done.
 * @returns {boolean} True if the update was successful; otherwise, false.
 */
export function updateSourcePosition(id: number, pos: Float32Array, ori: Float32Array, dt: number) {
    if (id >= idList.length) return false;
    const panner = pannerNodes[id];
    if (panner === undefined) return false;

    const time = _audioContext.currentTime + dt;
    panner.positionX.linearRampToValueAtTime(pos[0], time);
    panner.positionY.linearRampToValueAtTime(pos[2], time);
    panner.positionZ.linearRampToValueAtTime(-pos[1], time);
    panner.orientationX.linearRampToValueAtTime(ori[0], time);
    panner.orientationY.linearRampToValueAtTime(ori[2], time);
    panner.orientationZ.linearRampToValueAtTime(-ori[1], time);

    return true;
}

/**
 * Removes a source from the manager.
 *
 * @param {number} id - ID of the source that should be removed.
 */
export function removeSource(id: number) {
    if (id >= idList.length) return;
    idList[id] = '';
}

async function getAudioData(file: string) {
    if (await audioBuffers[file]) return;
    const response = await fetch(file);
    const buffer = await response.arrayBuffer();
    audioBuffers[file] = _audioContext.decodeAudioData(buffer);
}

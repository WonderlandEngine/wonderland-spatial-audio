/**
 * This is a modified version of twoz [hrtf-panner-js](https://github.com/twoz/hrtf-panner-js)
 *
 * Translated to TypeScript and using [MIT HRTF measurements](https://sound.media.mit.edu/resources/KEMAR.html)
 */

import {_audioContext as audioContext, CONV_FREQ} from './hrft-audio-mixer.js';

/**
 * Constants
 */
const CROSSFADE_DUR = 128 / 1000;
const THRESHOLD = 0.1;
const EIGHTY_PI = 180 / Math.PI;
const REFDISTANCE = 1.0;
const ROLLOFF = 0.5;
const SHORT_MAX = 0x7fff;
const SHORT_NORM_TO_FLOAT = 1.0 / SHORT_MAX;

/**
 * Variables
 */
let hrir: Float32Array;
let sortedPoints: number[];
let sampleSize = -1;

function getSampleSizeFromPathName(path: string): number {
    const match = path.match(/\d+/);
    if (match) {
        return parseInt(match[0], 10);
    }
    throw new Error('Sample size could not be identified!');
}

export async function loadHrir(hrir_path: string): Promise<boolean> {
    sampleSize = getSampleSizeFromPathName(hrir_path);
    const response = await fetch(hrir_path);
    const buffer = await response.arrayBuffer();

    let points: [number, number, number][] = [];
    if (!buffer) return false;

    const bufferi16 = new Int16Array(buffer);
    const measurementCount = bufferi16[0];

    /* Our sample data is U16 shorts, we convert to F32 here. */
    hrir = new Float32Array(measurementCount * sampleSize);
    const hrirU16 = bufferi16.subarray(2 + measurementCount * 2);
    for (let i = 0; i < hrir.length; ++i) {
        hrir[i] = hrirU16[i] * SHORT_NORM_TO_FLOAT;
    }

    let offset = 1; /* Skip measurementCount int */
    for (let i = 0; i < measurementCount / 2; ++i) {
        const elevation = bufferi16[offset];
        const azimuth = bufferi16[offset + 1];
        points.push([elevation, azimuth, i * 2]);
        /* Skip the right ear because the point is the same */
        offset += 4;
    }

    points.sort((a, b) => {
        if (a[0] !== b[0]) {
            return a[0] - b[0];
        }

        /* Sort from large to small on azimuth */
        return b[1] - a[1];
    });
    sortedPoints = points.flat();
    return true;
}

function interpolateHRIR(
    azimuth: number,
    elevation: number,
    out: [Float32Array, Float32Array]
): void {
    const elevMin = Math.floor(elevation / 10) * 10;
    const elevMax = elevMin + 10;

    /* Largest elevation only has 1 measurement */
    if (elevMin === 90) {
        const bufferIndexOf90 = sortedPoints[sortedPoints.length - 1];
        const blockSize = sampleSize;
        const iL: number = bufferIndexOf90 * blockSize;
        const iR: number = (bufferIndexOf90 + 1) * blockSize;
        for (let i = 0; i < sampleSize; ++i) {
            out[0][i] = hrir[iL + i];
            out[1][i] = hrir[iR + i];
        }
        return;
    }
    /* In this case elevMax only has one measurement, so no square of points can be found around our point */
    if (elevMin === 80) {
        const aziMin = Math.floor(azimuth / 30) * 30;
        const aziMax = aziMin === 330 ? 0 : aziMin + 30;

        /* Find index of azimuth of two points around requested point */
        const minPointIndex = (aziMin / 30) * 3 + 4;
        const maxPointIndex = (aziMax / 30) * 3 + 4;

        const bufferIndexMin = sortedPoints[sortedPoints.length - minPointIndex];
        const bufferIndexMax = sortedPoints[sortedPoints.length - maxPointIndex];

        /* Calculate the weighting of each one of the four points */
        const elevWeight1 = (elevation - elevMin) / 10;
        const aziWeight0 = (azimuth - aziMin) / 30;
        const elevWeight2 = 1 - elevWeight1;
        const aziWeight1 = 1 - aziWeight0;

        const bufferIndexOf90 = sortedPoints[sortedPoints.length - 1];
        const blockSize = sampleSize; // TODO: +2 ??
        const iL = bufferIndexOf90 * blockSize;
        const iR = (bufferIndexOf90 + 1) * blockSize;
        const minL = hrir[bufferIndexMin * blockSize];
        const minR = hrir[(bufferIndexMin + 1) * blockSize];
        const maxL = hrir[bufferIndexMax * blockSize];
        const maxR = hrir[(bufferIndexMax + 1) * blockSize];

        for (let i = 0; i < sampleSize; ++i) {
            out[0][i] =
                elevWeight2 * hrir[iL + i] +
                elevWeight1 * (aziWeight0 * minL + aziWeight1 * maxL);
            out[1][i] =
                elevWeight2 * hrir[iR + i] +
                elevWeight1 * (aziWeight0 * minR + aziWeight1 * maxR);
        }

        return;
    }

    const bufferIndex = [-1, -1, -1, -1];
    const foundAzi = [-1, -1, -1, -1];
    const arrayLength = sortedPoints.length;

    /* Run through all available points until finding the 4 closest points
     * around the request point. */
    let i = 0;
    for (i; i < arrayLength; i += 3) {
        /* Find two hrir measurements surrounding and below the requested one */
        if (sortedPoints[i] === elevMin) {
            /* Special case where the azimuth is in the range between 355 and 0 */
            if (azimuth >= sortedPoints[i + 1]) {
                bufferIndex[0] = sortedPoints[i + 2];
                foundAzi[0] = sortedPoints[i + 1];
                /* Find the 0 degree point */
                for (let j = i + 4; j < arrayLength; j += 3) {
                    if (sortedPoints[j] === 0) {
                        bufferIndex[1] = sortedPoints[j + 1];
                        foundAzi[1] = sortedPoints[j];
                        break;
                    }
                }
                break;
            } else {
                for (let j = i + 4; j < arrayLength; j += 3) {
                    /* Find pos of correct azimuth */
                    if (sortedPoints[j] < azimuth) {
                        bufferIndex[0] = sortedPoints[j + 1];
                        foundAzi[0] = sortedPoints[j];
                        /* Push previous bigger one */
                        bufferIndex[1] = sortedPoints[j - 2];
                        foundAzi[1] = sortedPoints[j - 3];
                        break;
                    }
                }
                break;
            }
        }
    }
    for (i; i < arrayLength; i += 3) {
        /* Find two hrir measurements surrounding and above the requested one */
        if (sortedPoints[i] === elevMax) {
            /* Special case where the azimuth is in the range between 355 and 0 */
            if (azimuth >= sortedPoints[i + 1]) {
                bufferIndex[2] = sortedPoints[i + 2];
                foundAzi[2] = sortedPoints[i + 1];
                /* Find the 0 degree point */
                for (let j = i + 4; j < arrayLength; j += 3) {
                    if (sortedPoints[j] === 0) {
                        bufferIndex[3] = sortedPoints[j + 1];
                        foundAzi[3] = sortedPoints[j];
                        break;
                    }
                }
                break;
            } else {
                for (let j = i + 4; j < arrayLength; j += 3) {
                    /* Find pos of correct azimuth */
                    if (sortedPoints[j] < azimuth) {
                        bufferIndex[2] = sortedPoints[j + 1];
                        foundAzi[2] = sortedPoints[j];
                        /* Push previous bigger one */
                        bufferIndex[3] = sortedPoints[j - 2];
                        foundAzi[3] = sortedPoints[j - 3];
                        break;
                    }
                }
                break;
            }
        }
    }

    /* Calculate the weighting of each one of the four points */
    const aziSpace = Math.abs(foundAzi[1] - foundAzi[0]);
    const aziSpace2 = Math.abs(foundAzi[3] - foundAzi[2]);
    const elevWeight1 = (elevation - elevMin) / 10;
    const aziWeight0 = (azimuth - foundAzi[0]) / aziSpace;
    const aziWeight2 = (azimuth - foundAzi[2]) / aziSpace2;
    const elevWeight2 = 1 - elevWeight1;
    const aziWeight1 = 1 - aziWeight0;
    const aziWeight3 = 1 - aziWeight2;

    const blockSize = sampleSize;
    const iAL = bufferIndex[0] * blockSize;
    const iAR = (bufferIndex[0] + 1) * blockSize;
    const iBL = bufferIndex[1] * blockSize;
    const iBR = (bufferIndex[1] + 1) * blockSize;
    const iCL = bufferIndex[2] * blockSize;
    const iCR = (bufferIndex[2] + 1) * blockSize;
    const iDL = bufferIndex[3] * blockSize;
    const iDR = (bufferIndex[3] + 1) * blockSize;

    for (let i = 0; i < sampleSize; ++i) {
        out[0][i] =
            elevWeight1 * (aziWeight0 * hrir[iAL + i] + aziWeight1 * hrir[iBL + i]) +
            elevWeight2 * (aziWeight2 * hrir[iCL + i] + aziWeight3 * hrir[iDL + i]);
        out[1][i] =
            elevWeight1 * (aziWeight0 * hrir[iAR + i] + aziWeight1 * hrir[iBR + i]) +
            elevWeight2 * (aziWeight2 * hrir[iCR + i] + aziWeight3 * hrir[iDR + i]);
    }
    return;
}

export class HRTFPanner {
    private readonly volume: number;
    private readonly source: GainNode;
    private readonly hiPass: BiquadFilterNode;
    private readonly lastPos: number[];
    private targetConvolver: HRTFConvolver;
    private currentConvolver: HRTFConvolver;
    private endOfTransition: number;
    public hrir: [Float32Array, Float32Array];
    private oldVol: number;

    constructor(sourceNode: GainNode, vol: number) {
        this.volume = vol;
        this.oldVol = 1.0;
        this.hrir = [new Float32Array(sampleSize), new Float32Array(sampleSize)];
        this.hiPass = audioContext.createBiquadFilter();
        this.hiPass.type = 'highpass';
        this.hiPass.frequency.value = CONV_FREQ;

        this.targetConvolver = new HRTFConvolver();
        this.currentConvolver = new HRTFConvolver();

        this.source = sourceNode;
        this.source.channelCount = 1;
        this.source.connect(this.hiPass);
        this.hiPass.connect(this.currentConvolver.convolver);
        this.hiPass.connect(this.targetConvolver.convolver);
        this.currentConvolver.fadeGain.connect(audioContext.destination);
        this.targetConvolver.fadeGain.connect(audioContext.destination);

        /* lastPos cant be undefined, otherwise the first update() will fail */
        this.lastPos = [999, 999];
        this.endOfTransition = audioContext.currentTime;
    }

    /**
     * Update the position of the panner.
     *
     * @param azimuth Position of the new location
     * @param elevation Position of the new location
     * @param distance Distance of listener to source
     */
    public update(azimuth: number, elevation: number, distance: number): void {
        /* Skip if the position didn't change enough or there is still a crossfade going on */
        if (
            this.endOfTransition < audioContext.currentTime &&
            (Math.abs(this.lastPos[0] - azimuth) > THRESHOLD ||
                Math.abs(this.lastPos[1] - elevation) > THRESHOLD)
        ) {
            interpolateHRIR(azimuth, elevation, this.hrir);
            this.targetConvolver.fillBuffer(this.hrir);
            const vol =
                (REFDISTANCE /
                    (REFDISTANCE +
                        ROLLOFF * (Math.max(distance, REFDISTANCE) - REFDISTANCE))) *
                this.volume;

            const currTime = audioContext.currentTime;
            this.endOfTransition = currTime + CROSSFADE_DUR;

            this.source.gain.setValueAtTime(this.oldVol, currTime);
            this.source.gain.linearRampToValueAtTime(vol, this.endOfTransition);

            this.targetConvolver.fadeGain.gain.setValueAtTime(0, currTime);
            this.targetConvolver.fadeGain.gain.linearRampToValueAtTime(
                1,
                this.endOfTransition
            );
            this.currentConvolver.fadeGain.gain.setValueAtTime(1, currTime);
            this.currentConvolver.fadeGain.gain.linearRampToValueAtTime(
                0,
                this.endOfTransition
            );
            this.oldVol = vol;

            /* Swap convolvers */
            let t = this.targetConvolver;
            this.targetConvolver = this.currentConvolver;
            this.currentConvolver = t;

            /* Save the current position */
            this.lastPos[0] = azimuth;
            this.lastPos[1] = elevation;
        }
        return;
    }
}

class HRTFConvolver {
    public convolver: ConvolverNode;
    public fadeGain: GainNode;
    public buffer: AudioBuffer;

    constructor() {
        this.convolver = audioContext.createConvolver();
        this.convolver.normalize = false;
        this.fadeGain = audioContext.createGain();
        this.buffer = audioContext.createBuffer(2, sampleSize, audioContext.sampleRate);
        this.convolver.buffer = this.buffer;
        this.convolver.connect(this.fadeGain);
    }

    public fillBuffer(buf: [Float32Array, Float32Array]): void {
        this.buffer.copyToChannel(buf[0], 0);
        this.buffer.copyToChannel(buf[1], 1);
        this.convolver.buffer = this.buffer;
    }
}

/**
 * Converts cartesion to interaural coordinates.
 *
 * @note This is NOT a standard conversion! It is modified,
 *  to respect the hrtf measurements, used in this project.
 *
 * @param x - axis that passes through the ears from left to right
 * @param y - axis that passes "between the eyes" and points ahead
 * @param z - axis that points "up"
 *
 * @returns azimuth and elevation in degrees.
 */
export function cartesianToInteraural(
    x: number,
    y: number,
    z: number
): {azimuth: number; elevation: number} {
    const horizontalDistance = Math.sqrt(x * x + y * y);
    const azimuth = Math.atan2(y, x);
    const elevation = Math.atan2(z, horizontalDistance);

    /* Convert to degrees and modify to fit HRIR */
    let azimuthDegrees = azimuth * EIGHTY_PI + 90;
    if (azimuthDegrees < 0) {
        azimuthDegrees = 360 + azimuthDegrees;
    }
    // @todo: Check if elevation needs modification.
    let elevationDegrees = elevation * EIGHTY_PI;
    if (elevationDegrees < -40) elevationDegrees = -40;
    return {azimuth: azimuthDegrees, elevation: elevationDegrees};
}

function interauralToCartesian(r: number, azm: number, elv: number) {
    azm = deg2rad(azm);
    elv = deg2rad(elv);
    let x1 = r * Math.sin(azm);
    let x2 = r * Math.cos(azm) * Math.cos(elv);
    let x3 = r * Math.cos(azm) * Math.sin(elv);
    return {x1: x1, x2: x2, x3: x3};
}

function deg2rad(deg: number) {
    return (deg * Math.PI) / 180;
}

function rad2deg(rad: number) {
    return (rad * 180) / Math.PI;
}

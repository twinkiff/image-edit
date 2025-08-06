import * as faceapi from 'face-api.js';

export async function buildDetector() {
    // TODO: Loading bar
    return await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
}

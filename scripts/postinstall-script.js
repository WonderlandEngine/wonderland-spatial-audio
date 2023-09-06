/**
 * NPM Post-Install Script
 *
 * This script is executed automatically after an NPM package installation
 * and is designed to copy a specific binary file, "hrtf_128.bin," from a
 * predefined source location to a target location within your project's
 * directory structure.
 *
 * Script Overview:
 * - Determine the project's root directory.
 * - Define source and destination paths.
 * - Check for the existence of the destination folder.
 * - Copy the file to the destination if it doesn't already exist.
 *
 * Usage:
 * This script ensures that the "hrtf_128.bin" file is available in the
 * "static" folder of your project, which is essential for proper project
 * functionality.
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const pathToScript = fileURLToPath(import.meta.url);
const projectRoot = trimUntilBeforeNodeModules(pathToScript);
const sourceFile = path.join(path.dirname(pathToScript), '..', 'hrtf', 'hrtf_128.bin');

if(projectRoot === undefined) {
    console.log('Could not locate project root directory.');
} else {
    const destinationFile = path.join(projectRoot, 'static', 'hrtf_128.bin');
    const destinationFolder = path.join(projectRoot, 'static');

    if (!fs.existsSync(destinationFolder)) fs.mkdirSync(destinationFolder);

    if (fs.existsSync(destinationFile)) {
        console.log('File already exists, skipping copy.');
    } else {
        fs.copyFileSync(sourceFile, destinationFile);
        console.log('File copied successfully!');
    }
}

function trimUntilBeforeNodeModules(inputString) {
    const indexOfNodeModules = inputString.lastIndexOf('node_modules');
    if (indexOfNodeModules !== -1) {
        return inputString.slice(0, indexOfNodeModules);
    } else {
        return undefined;
    }
}

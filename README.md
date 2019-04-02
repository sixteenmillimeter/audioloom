# audioloom

Interweave slices of audio files together using sox

--------

## Requirements 

Node.js 0.8.x +

This script requires `node.js` as the runtime and `sox` to export and stitch audio back together.

Installation instructions for sox here: https://sourceforge.net/projects/sox/files/sox/

## Installation

```
git clone https://github.com/sixteenmillimeter/audioloom.git
cd audioloom
npm install 
chmod +x audioloom
```

## Basic Usage

```./audioloom -i /path/to/audio1:/path/to/audio2 -o /path/to/output```

## Options

Run `./audioloom -h` to display help screen.

```
Usage: audioloom [options]

Options:
  -V, --version            output the version number
  -i, --input [files]      Specify input audio files with paths seperated by colon
  -o, --output [file]      Specify output path of audio file
  -p, --pattern [pattern]  Specify a pattern for the alternating 1:1 is standard
  -r, --realtime           Specify if audio files should preserve realtime speed
  -t, --tmp [dir]          Specify tmp directory for exporting slices
  -m, --ms [ms]            Specify length of slices using length in milliseconds, will default to 1/24 sec
  -R, --random             Randomize slices. Ignores pattern if included
  -h, --help               output usage information

```

## TODO

* Fix alternate sort pattern features
* Check for sox before executing
* Generate example audiofiles automatically
* Publish example audio files
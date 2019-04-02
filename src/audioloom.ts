#!/usr/bin/env node

'use strict'

const execRaw 	= require('child_process').exec
const os 		= require('os')
const path 		= require('path')
const program 	= require('commander')
const fs 		= require('fs-extra')
const packageJson = require('./package.json')

let TMPDIR : string  = os.tmpdir() || '/tmp'
let TMPPATH : string

let EXE : string = `sox`
let IDENTIFY : string = `soxi`
let SLICE : string = (1000 / 24) + ''

/**
 * 	Shells out to execute a command with async/await.
 * 	Async wrapper to exec module.
 *
 *	@param	{string} 	cmd 	Command to execute
 *
 *	@returns {Promise} 	Promise containing the complete stdio
 **/
async function exec (cmd : string) {
	return new Promise((resolve : any, reject : any) => {
		return execRaw(cmd, (err : any, stdio : string, stderr : string) => {
			if (err) return reject(err)
			return resolve(stdio)
		})
	})
}
/**
 * 	Delays process for specified amount of time in milliseconds.
 *
 *	@param	{integer} 	ms 	Milliseconds to delay for
 *
 *	@returns {Promise} 	Promise that resolves after set time
 **/
async function delay (ms : number) {
	return new Promise((resolve, reject) =>{
		return setTimeout(resolve, ms)
	})
}
/**
 * 	Pads a numerical value with preceding zeros to make strings same length.
 *
 *	@param 	{integer} 	i 		Number to pad
 * 	@param 	{integer} 	max 	(optional) Maximum length of string to pad to
 *
 * 	@returns {string} 	Padded number as a string
 **/
function zeroPad (i : number, max : number = 5) {
	const len : number = (i + '').length
	let str : string = i + ''
	for (let x : number = 0; x < max - len; x++) {
		str = '0' + str
	}
	return str
}
/**
 * 	Shuffles an array into a random state.
 *
 * 	@param 	{array} 	a 	Array to randomize
 **/
function shuffle (array : any[]) {
	let j : any 
	let temp : any
    for (let i : number = array.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1))
        temp = array[i]
        array[i] = array[j]
        array[j] = temp
    }
}
/**
 * 	Clears the temporary directory of all files. 
 * 	Establishes a directory if none exists.
 **/
async function clear () {
	let cmd : string = `rm -r "${TMPPATH}"`
	let exists : boolean

	try {
		exists = await fs.exists(TMPPATH)
	} catch (err) {
		console.error(err)
	}

	if (exists) {
		console.log(`Clearing temp directory "${TMPPATH}"`)
		try {
			await exec(cmd)
		} catch (err) {
			//suppress error
			console.dir(err)
		}
	}

	try {
		await fs.mkdir(TMPPATH)
	} catch (err) {
		if (err.code !== 'EEXIST') {
			console.error(err)
		}
	}

	return true
}
/**
 *	Parses timecode string to float of total seconds
 *
 * @param  {string} 	str 		Timecode string to parse
 *
 * @returns {float} 	Seconds at float 
 **/
function parseTC (str : string) {
	const parts : any [] = str.split(':')
	let sec : number  = 0
	if (parts[0] != 0) sec += parseFloat(parts[0]) * 60 * 60
	if (parts[1] != 0) sec += parseFloat(parts[1]) * 60
	if (parts[2] != 0) sec += parseFloat(parts[2])
	return sec
}

/**
 *	Returns offset position of audio file to slice at.
 *
 * @param  {integer} 	i 		Count of slice to make
 * @param  {float}		slice 	Length of slice, might be str
 *
 * @returns {str} 	New position cast as string
 **/
async function audioLength (filePath : string) {
	const exe : string = IDENTIFY
	const cmd : string = `${exe} -d "${filePath}"`
	let str : any

	try {
		str = await exec(cmd)
	} catch (err) {
		console.error(err)
		process.exit(11)
	}
	return parseTC(str)
}

/**
 *	Returns offset position of audio file to slice at.
 *
 * @param  {integer} 	i 		Count of slice to make
 * @param  {float}		slice 	Length of slice, might be str
 *
 * @returns {str} 	New position cast as string
 **/

function offset (i : number, slice : any) {
	return (i * (parseFloat(slice) / 1000)) + ''
}

/**
 * 	Exports all slices from audio file. Appends number to the string
 * 	to keep slices in alternating order to be quickly stitched together
 *  or re-sorted.
 *
 * 	@param 	{string} 	file 	String representing path to audio file
 *  @param  {float}		len 	Length of the slice to make
 * 	@param 	{integer} 	order 	Integer to be appended to pathname of file
 *
 * 	@returns 	{string} 	String with the export order, not sure why I did this
 **/
async function slices (file : string, len : number, order : number) {
	let ext : string = 'wav'
	let exe : string = EXE
	let slice : string  = SLICE
	let tmpoutput : string
	let cmd : string
	let i : number = 0
	let total = Math.floor((len * 1000) / parseFloat(slice))
	console.log(`Exporting ${file} as ${total} slices ${SLICE}ms long...`)

	for (i = 0; i < total; i++) {
		tmpoutput = path.join(TMPPATH, `export-${zeroPad(i)}_${order}.${ext}`)
		cmd = `${exe} "${file}" "${tmpoutput}" trim ${offset(i, slice)} ${parseFloat(slice) / 1000}`
		try {
			console.log(cmd)
			await exec(cmd)
		} catch (err) {
			console.error('Error exporting file', err)
			return process.exit(3)
		}
	}
	return path.join(TMPPATH, `export-%05d_${order}`)
} 

/**
 *	Re-arranges the slices into the order specified in the pattern.
 *	Calls `patternSort()` to perform the rename and unlink actions
 * 
 * 	@param 	{array} 	pattern 	Pattern of the slices per input
 * 	@param 	{boolean}	realtime 	Flag to turn on or off realtime behavior (drop slice / number of files)
 *  @param  {boolean}	random 		Flag to turn on or off random behavior
 *
 *  @returns {array} Array of slice paths
 **/
async function weave (pattern : number[], realtime : boolean, random : boolean) {
	let slices : string[]
	let seq : string[]
	let ext : string = '.wav'
	let alt : boolean = false

	console.log('Weaving slices...')

	try {
		slices = await fs.readdir(TMPPATH)
	} catch (err) {
		console.error('Error reading tmp directory', err)
	}

	//console.dir(slices)
	slices = slices.filter (file => {
		if (file.indexOf(ext) !== -1) return true
	})
	
	for (let el of pattern) {
		if (el !== 1) alt = true
	}

	if (random){
		try {
			seq = await randomSort(slices, pattern, realtime)
		} catch (err) {
			console.error('Error sorting slices')
		}
	} else if (!alt) {
		try {
			seq = await standardSort(slices, pattern, realtime)
		} catch (err) {
			console.error('Error sorting slices')
		}
	} else if (alt) {
		console.warn('This feature is not ready, please check https://github.com/sixteenmillimeter/audioloom.git')
		process.exit(10)
		try {
			seq = await altSort(slices, pattern, realtime)
		} catch (err) {
			console.error('Error sorting slices')
		}
	}
	//console.dir(seq)
	return seq
}
/**
 *  TODO
 * 	Alternate slice sorting method.
 *
 *	@param	{array}		list 		List of slices to group
 * 	@param 	{array} 	pattern 	Array representing pattern
 *	@param 	{boolean}	realtime 	Flag to group with "realtime" behavior
 *
 *  @returns {array} Sorted array of slices
 **/
async function altSort (list : string[], pattern : number[], realtime : boolean) {
	let groups : any[] = []
	let newList : string[] = []
	let sliceCount : number = 0
	let oldPath : string
	let newName : string
	let newPath : string 
	let ext : string = path.extname(list[0])
	
	for (let g of pattern) {
		groups.push([])
	}
	for (let i = 0; i < list.length; i++) {
		groups[i % pattern.length].push(list[i])
	}
	for (let x : number = 0; x < list.length; x++) {
		for (let g of pattern) {
			for (let i = 0; i < g; i++) {

				/*oldPath = path.join(TMPPATH, list[i]);
				newName = `./render_${zeroPad(sliceCount)}${ext}`;
				newPath = path.join(TMPPATH, newName);

				console.log(`Renaming ${list[i]} -> ${newName}`);

				try {
					//await fs.move(oldPath, newPath, { overwrite: true })
					newList.push(newName);
				} catch (err) {
					console.error(err);
				}*/

				sliceCount++
			}
		}
	}
	return newList
}
/**
 * 	Standard slice sorting method.
 *
 *	@param	{array}		list 		List of slices to group
 * 	@param 	{array} 	pattern 	Array representing pattern
 *	@param 	{boolean}	realtime 	Flag to group with "realtime" behavior
 *
 *  @returns {array} Sorted array of slices
 **/
async function standardSort (list : string[], pattern : number[], realtime : boolean) {
	let sliceCount : number = 0
	let stepCount : number
	let step : number
	let skipCount : number
	let skip : boolean
	let ext : string = path.extname(list[0])
	let oldPath : string
	let newName : string
	let newPath : string
	let newList : string[] = []

	if (realtime) {
		skip = false
		skipCount = pattern.length + 1
	}
	
	for (let i : number = 0; i < list.length; i++) {
		if (realtime) {
			skipCount--;
			if (skipCount === 0) {
				skip = !skip;
				skipCount = pattern.length
			}
		}

		oldPath = path.join(TMPPATH, list[i])

		if (skip) {
			console.log(`Skipping ${list[i]}`)
			try {
				await fs.unlink(oldPath)
			} catch (err) {
				console.error(err)
			}
			continue
		}

		newName = `./render_${zeroPad(sliceCount)}${ext}`
		newPath = path.join(TMPPATH, newName)
		console.log(`Renaming ${list[i]} -> ${newName}`)

		try {
			await fs.move(oldPath, newPath)
			newList.push(newName)
			sliceCount++
		} catch (err) {
			console.error(err)
			return process.exit(10)
		}

		
	}

	return newList
}
/**
 *	Ramdomly sort slices for re-stitching.
 *	
 *	@param	{array}		list 		List of slices to group
 * 	@param 	{array} 	pattern 	Array representing pattern
 *	@param 	{boolean}	realtime 	Flag to group with "realtime" behavior
 *
 *  @returns {array} Sorted array of slices
 **/
async function randomSort (list : string[], pattern : number[], realtime : boolean) {
	let sliceCount : number = 0
	let ext : string = path.extname(list[0])
	let oldPath : string
	let newName : string
	let newPath : string
	let newList : string[] = []
	let removeLen : number = 0
	let remove : string[] = []

	shuffle(list)

	if (realtime) {
		removeLen = Math.floor(list.length / pattern.length)
		remove = list.slice(removeLen, list.length)
		list = list.slice(0, removeLen)

		console.log(`Skipping extra slices...`)
		for (let i = 0; i < remove.length; i++) {
			oldPath = path.join(TMPPATH, remove[i])
			console.log(`Skipping ${list[i]}`)
			try {
				await fs.unlink(oldPath)
			} catch (err) {
				console.error(err)
			}
		}
	}
	
	for (let i : number = 0; i < list.length; i++) {
		oldPath = path.join(TMPPATH, list[i])

		newName = `./render_${zeroPad(sliceCount)}${ext}`
		newPath = path.join(TMPPATH, newName)
		console.log(`Renaming ${list[i]} -> ${newName}`)

		try {
			await fs.move(oldPath, newPath)
			newList.push(newName)
		} catch (err) {
			console.error(err)
		}

		sliceCount++
	}

	return newList
}
/**
 *	Render the slices into a video using ffmpeg.
 *
 * 	@param 	{string} 	output 	Path to export the video to
 **/
async function render (allSlices : string[], output : string) {
	let ext : string = path.extname(allSlices[0])
	let partSize = 500
	let partCount : number = Math.ceil(allSlices.length / partSize);
	let partName : string
	let partFile : string
	let parts : string[] = []
	

	allSlices = allSlices.map(file => {
		return path.join(TMPPATH, file)
	})

	if (partCount < 2) {
		return await arrToFile(allSlices, output);
	}

	for (let part : number = 0; part < partCount; part++) {
		partName = `./render_part_${zeroPad(part)}${ext}`
		partFile = path.join(TMPPATH, partName)
		await arrToFile(allSlices.slice(part * partSize, (part + 1) * partSize), partFile);
		parts.push(partFile);
		//process.exit()
	}

	return await arrToFile(parts, output);

}

async function arrToFile (arr : string[], output : string) {
	let exe : string = EXE
	let cmd : string  = `${exe} ${arr.join(' ')} ${output}`
	
	console.log(`Exporting audio ${output}`)
	console.log(cmd)

	try {
		await exec(cmd)
	} catch (err) {
		console.error(err)
	}
}

/**
 * 	Parses the arguments and runs the process of exporting, sorting and then
 * 	"weaving" the slices back into an audio file
 * 
 * @param {object} 	arg 	Object containing all arguments
 **/
async function main (arg : any) {
	let input : string[] = arg.input.split(':')
	let output : string = arg.output
	let pattern : number[] = []
	let realtime : boolean = false
	let random : boolean = false
	let allSlices : string []
	let len : number 
	console.time('audioloom')

	if (input.length < 2) {
		console.error('Must provide more than 1 input')
		return process.exit(1)
	}

	if (!output) {
		console.error('Must provide audio output path')
		return process.exit(2)
	}

	if (arg.random) {
		random = true
	}

	if (arg.tmp) {
		TMPDIR = arg.tmp
	}

	if (arg.fps) {
		SLICE = (1000 / parseFloat(arg.fps)) + ''
	}

	// ms overrides fps
	if (arg.ms) {
		SLICE = (1000 / parseFloat(arg.ms)) + ''
	}

	if (arg.pattern) {
		pattern = arg.pattern.split(':')
		pattern = pattern.map(function (el : any) {
			return parseInt(el)
		})
	} else {
		for (let i = 0; i <input.length; i++) {
			pattern.push(1);
		}
	}

	if (arg.realtime) realtime = true

	TMPPATH = path.join(TMPDIR, 'audioloom')

	try {
		await clear()
	} catch (err) {
		console.error(err)
		return process.exit(3)
	}

	console.log(`Processing audio files ${input.join(', ')} into ${output} with pattern ${pattern.join(':')}`)

	for (let i : number = 0; i <input.length; i++) {
		try {
			len  = await audioLength(input[i])
		} catch (err) {
			console.error(err)
			return process.exit(4)
		}
		try {
			await slices(input[i], len, i)
		} catch (err) {
			console.error(err)
			return process.exit(4)
		}
	}

	try {
		allSlices = await weave(pattern, realtime, random)
	} catch (err) {
		console.error(err)
		return process.exit(5)
	}

	try {
		await render(allSlices, output)
	} catch (err) {
		console.error(err)
		return process.exit(6)
	}

	try {
		await clear()
	} catch (err) {
		console.error(err)
		return process.exit(7)
	}

	console.timeEnd('audioloom')
}

program
  .version(packageJson.version)
  .option('-i, --input [files]', 'Specify input audio files with paths seperated by colon')
  .option('-o, --output [file]', 'Specify output path of audio file')
  .option('-p, --pattern [pattern]', 'Specify a pattern for the alternating 1:1 is standard')
  .option('-r, --realtime', 'Specify if audio files should preserve realtime speed')
  .option('-t, --tmp [dir]', 'Specify tmp directory for exporting slices')
  .option('-m, --ms [ms]', 'Specify length of slices using length in milliseconds, will default to 1/24 sec')

  .option('-R, --random', 'Randomize slices. Ignores pattern if included')
  .parse(process.argv)

main(program)
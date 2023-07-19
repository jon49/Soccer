// deno run --allow-run --allow-read --allow-write .\start.ts
import { createHash } from "https://deno.land/std@0.159.0/hash/mod.ts"
import {
  readableStreamFromReader,
  writableStreamFromWriter,
} from "https://deno.land/std@0.159.0/streams/conversion.ts"
// import { mergeReadableStreams } from "https://deno.land/std@0.159.0/streams/merge.ts"

const input="THIS IS AN INPUT"
const hash = createHash("md5")
hash.update(input)
console.log(hash.toString())

////

const file = await Deno.open("../temp/temp.txt", {
  read: true,
  write: true,
  create: true,
});
const fileWriter = await writableStreamFromWriter(file);

// start the process
const process = Deno.run({
  cmd: ["cat", "../temp/temp.js"],
  stdout: "piped",
  stderr: "piped",
});

// example of combining stdout and stderr while sending to a file
const stdout = readableStreamFromReader(process.stdout);
// const stderr = readableStreamFromReader(process.stderr);
// const joined = mergeReadableStreams(stdout, stderr);
// returns a promise that resolves when the process is killed/closed
// joined.pipeTo(fileWriter).then(() => console.log("pipe join done"));
stdout.pipeTo(fileWriter).then(() => console.log("finished writing file"))

// manually stop process "yes" will never end on its own
setTimeout(async () => {
  process.kill("SIGINT");
}, 100);

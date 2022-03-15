import { Dropbox } from "dropbox";
import { default as Options } from "@jhanssen/options";
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const options = Options("video-upload-dropbox");
const accessToken = options("access-token");
const watchDirectory = options("watch-dir");
const uploadTimeout = options.int("upload-timeout", 5000);

let timer = undefined;
let files = [];

async function uploadFiles(files) {
    const dbx = new Dropbox({ accessToken });

    for (let f of files) {
        const contents = await readFile(f);
        const ret = await dbx.filesUpload({ path: "/" + basename(f), contents: contents });
        if (ret.status !== 200) {
            throw new Error(`Failed to upload ${JSON.stringify(ret)}`);
        }
        console.log("uploaded", basename(f));
    }
}

function addUploadFile(file) {
    files.push(file);
    if (timer !== undefined)
        clearTimeout(timer);
    timer = setTimeout(() => {
        const f = files;
        files = [];

        uploadFiles(f).then(() => {
        }).catch(e => {
            console.error(e);
        });

        timer = undefined;
    }, uploadTimeout);
}

console.log("watching", watchDirectory);

watch(watchDirectory, { ignoreInitial: true }).on("all", (event, path) => {
    if (event === "add") {
        console.log("file added", path);
        addUploadFile(path);
    }
});

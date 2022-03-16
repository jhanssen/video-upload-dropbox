import { Dropbox } from "dropbox";
import { default as Options } from "@jhanssen/options";
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";

const options = Options("video-upload-dropbox");
const accessToken = options("access-token");
const watchDirectory = options("watch-dir");
const uploadTimeout = options.int("upload-timeout", 5000);

let timer = undefined;
let files = [];

function removeSlash(p) {
    if (typeof p === "string" && p[0] === "/")
        return p.substr(1);
    return p;
}

function stripPath(p) {
    if (p.indexOf(watchDirectory) === 0)
        return removeSlash(p.substr(watchDirectory.length));
    return removeSlash(p);
}

async function uploadFiles(subfiles) {
    const dbx = new Dropbox({ accessToken });

    for (let f of subfiles) {
        const contents = await readFile(f);
        try {
            const ret = await dbx.filesUpload({ path: "/" + stripPath(f), contents: contents });
            if (ret.status !== 200) {
                throw new Error(`Failed to upload ${JSON.stringify(ret)}`);
            }
            console.log("uploaded", stripPath(f));
        } catch (e) {
            if (e.code === "ECONNREFUSED") {
                // retry
                addUploadFile(f);
            } else {
                throw e;
            }
        }
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

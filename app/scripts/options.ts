import { browser } from "webextension-polyfill-ts";

async function restore() {
    const response = await browser.runtime.sendMessage({
        action: "RESTORE_CONFIG"
    });
    const configElement = document.getElementById("config") as HTMLTextAreaElement;
    if (configElement) {
        configElement.value = response;
    }
}

async function save() {
    const configElement = document.getElementById("config") as HTMLTextAreaElement;
    const response = await browser.runtime.sendMessage({
        action: "SAVE_CONFIG",
        config: configElement?.value
    });
    configElement.style.backgroundColor = response === "SUCCESS" ? "" : "#ffbbbb";
}

function throttle(func: Function, delay: number) {
    let timeoutID: null | any = null;

    function wrappedFunc() {
        timeoutID = null;
        func();
    }

    return function () {
        if (timeoutID !== null) {
            window.clearTimeout(timeoutID);
        }
        timeoutID = window.setTimeout(wrappedFunc, delay);
    };
}

const throttledSave = throttle(save, 250);
document.addEventListener("DOMContentLoaded", restore);
document.getElementById("config")?.addEventListener("input", throttledSave);

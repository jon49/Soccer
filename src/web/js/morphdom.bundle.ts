// @ts-nocheck
import morphdom from "morphdom";

window.htmf.swapOption.merge = (target, text) => {
    morphdom(target, text);
}
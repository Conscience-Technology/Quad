import { probe } from "./react-fiber";
import {
  bboxOf,
  domPathFor,
  outerHtmlPreview,
  selectorFor,
} from "./util";
import type { PinPayload } from "./types";

/** Build a PinPayload from a DOM element + maintainer body. The route is
 * derived from `location.pathname` so it survives client-side routing. */
export function buildPin(el: Element, body: string): Omit<PinPayload, "body"> & { body: string } {
  const reactInfo = probe(el);
  return {
    selector: selectorFor(el),
    domPath: domPathFor(el),
    componentPath: reactInfo.componentPath,
    sourceLocation: reactInfo.sourceLocation,
    bbox: bboxOf(el),
    route: location.pathname,
    pageUrl: location.href,
    outerHtmlPreview: outerHtmlPreview(el, 200),
    body,
  };
}

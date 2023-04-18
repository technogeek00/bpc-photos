import { qd } from "../libs/Quickdraw";
import Image from "../viewmodels/Image";
import PrintPackage from "../viewmodels/PrintPackage";
import PrintOrder from "../viewmodels/PrintOrder";

declare global {
    interface Window {
        CONFIG: EmbeddableConfig
    }
}

const CONFIG: EmbeddableConfig = window.CONFIG;

const ORDER = new PrintOrder(
    CONFIG.subject.images.map((str) => new Image(str, `${CONFIG.subject.id}/images/`, CONFIG.subject.token)),
    CONFIG.site.packages.map((pkg) => new PrintPackage(pkg.name, pkg.type, pkg.description, pkg.price, pkg.maximum)),
    CONFIG.subject
)

window.onload = function() {
    qd.bindModel(ORDER, document.body);
};
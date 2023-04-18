export default class Image {
    name: string;
    path: string;
    token: string;

    constructor(name: string, path: string, token: string) {
        this.name = name;
        this.path = path;
        this.token = token;
    }

    get filename() {
        return this.name;
    }

    get jpeg() {
        return `${this.path}${this.name}.jpg?token=${this.token}`;
    }

    get thumb() {
        return `${this.path}${this.name}.thumb.jpg?token=${this.token}`;
    }

    get raw() {
        return `${this.path}${this.name}.CR3?token=${this.token}`;
    }
}

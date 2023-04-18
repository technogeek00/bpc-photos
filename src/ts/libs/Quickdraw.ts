export const qd = require('@hulu/quickdraw');

// some types for better interop
export type QDObservable<Type> = (value?: Type) => Type;
export type QDComputed<ResultType> = () => ResultType;
export type QDObservableArray<Type> = {
    (arr?: Type[]): Type[],
    indexOf: (find: Type) => number,
    slice: (start?: number, end?: number) => Type[],
    push: (item: Type) => void,
    pop: () => Type,
    unshift: (item: Type) => void,
    shift: () => Type,
    reverse: () => void,
    sort: (func: (a: Type, b: Type) => number) => void,
    splice: (start?: number, deleteCount?: number, ...items: Type[]) => Type[],
    remove: (find: Type | ((item: Type) => boolean)) => Type | undefined,
    removeAll: (items?: Type[]) => Type[]
};
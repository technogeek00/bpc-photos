// subject descriptor
declare interface PhotoSubject {
    id: string,
    images: string[],
    token: string
}

// failed token details
declare interface TokenValidationFailure {
    status: number,
    reason: string
}

// configuration embedded by view rendering on page load
declare interface EmbeddableConfig {
    site: {
        packages: OrderablePackageConfiguration[]
    },
    subject: PhotoSubject
}

// JWT token body
declare interface BPCToken {
    subject: string // note this is a folder id
}

// /order POST body
declare interface OrderPictureBody {
    subject: PhotoSubject, // note this is actually serve inflated
    order: {
        id: string,
        packages: {
            name: string,
            quantity: number
        }[]
    }[]
}
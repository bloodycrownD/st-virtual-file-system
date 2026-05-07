export class VfsError extends Error {}

export class VfsNotFoundError extends VfsError {}
export class VfsAlreadyExistsError extends VfsError {}
export class VfsInvalidPathError extends VfsError {}
export class VfsNotDirectoryError extends VfsError {}
export class VfsIsDirectoryError extends VfsError {}

/**
 * @file JSON Schema (draft-04) and LLM-facing copy for the seven `vfs_*` function tools.
 * Parameter shapes align with `docs/Tools.md`.
 */

const DRAFT_04 = 'http://json-schema.org/draft-04/schema#'

export interface VfsFunctionToolSchemaEntry {
  name: string
  displayName: string
  shortTool: string
  description: string
  parameters: Record<string, unknown>
  formatMessage: (args: Record<string, unknown>) => string
}

function pathProperty(description: string) {
  return {
    type: 'string',
    description,
  }
}

function optionalNumber(description: string) {
  return {
    type: 'number',
    description,
  }
}

export const VFS_FUNCTION_TOOL_SCHEMAS: VfsFunctionToolSchemaEntry[] = [
  {
    name: 'vfs_read',
    displayName: 'VFS Read',
    shortTool: 'read',
    description:
      'Read a file from the current chat virtual file system. Paths must start with `/`. Optional line/char limits tighten output.',
    parameters: {
      $schema: DRAFT_04,
      type: 'object',
      properties: {
        path: pathProperty('Virtual file path (required, e.g. `/notes/a.txt`)'),
        startLine: optionalNumber('1-based start line (default 1)'),
        endLine: optionalNumber('1-based end line (inclusive)'),
        maxLines: optionalNumber('Max lines to return (cannot exceed built-in cap)'),
        maxChars: optionalNumber('Max characters to return (cannot exceed built-in cap)'),
      },
      required: ['path'],
    },
    formatMessage: (args) => `正在读取 ${String(args.path ?? '')}…`,
  },
  {
    name: 'vfs_write',
    displayName: 'VFS Write',
    shortTool: 'write',
    description:
      'Create or overwrite a file in the current chat virtual file system. Paths must start with `/`. Parent directories are created automatically.',
    parameters: {
      $schema: DRAFT_04,
      type: 'object',
      properties: {
        path: pathProperty('Virtual file path (required)'),
        content: {
          type: 'string',
          description: 'Full file content to write (defaults to empty string)',
        },
      },
      required: ['path'],
    },
    formatMessage: (args) => `正在写入 ${String(args.path ?? '')}…`,
  },
  {
    name: 'vfs_append',
    displayName: 'VFS Append',
    shortTool: 'append',
    description:
      'Append text to a file in the current chat virtual file system. Paths must start with `/`. Creates the file if missing.',
    parameters: {
      $schema: DRAFT_04,
      type: 'object',
      properties: {
        path: pathProperty('Virtual file path (required)'),
        content: {
          type: 'string',
          description: 'Text to append (defaults to empty string)',
        },
      },
      required: ['path'],
    },
    formatMessage: (args) => `正在追加 ${String(args.path ?? '')}…`,
  },
  {
    name: 'vfs_delete',
    displayName: 'VFS Delete',
    shortTool: 'delete',
    description:
      'Delete a file or directory in the current chat virtual file system. Set `recursive` to true only when intentionally removing a non-empty directory tree.',
    parameters: {
      $schema: DRAFT_04,
      type: 'object',
      properties: {
        path: pathProperty('Virtual file or directory path (required)'),
        recursive: {
          type: 'boolean',
          description: 'Must be true to recursively delete a non-empty directory',
        },
      },
      required: ['path'],
    },
    formatMessage: (args) => `正在删除 ${String(args.path ?? '')}…`,
  },
  {
    name: 'vfs_update',
    displayName: 'VFS Update',
    shortTool: 'update',
    description:
      'Replace a line range in a file when `expectedOldContent` exactly matches the current segment. Paths must start with `/`. Prevents silent line-drift overwrites.',
    parameters: {
      $schema: DRAFT_04,
      type: 'object',
      properties: {
        path: pathProperty('Virtual file path (required)'),
        startLine: optionalNumber('1-based start line (required, >= 1)'),
        endLine: optionalNumber('1-based end line (required, >= startLine)'),
        expectedOldContent: {
          type: 'string',
          description: 'Exact text of the lines to replace (must match file)',
        },
        newContent: {
          type: 'string',
          description: 'Replacement content for the line range',
        },
      },
      required: ['path', 'startLine', 'endLine', 'expectedOldContent', 'newContent'],
    },
    formatMessage: (args) => `正在更新 ${String(args.path ?? '')}…`,
  },
  {
    name: 'vfs_list',
    displayName: 'VFS List',
    shortTool: 'list',
    description: 'List entries under a directory in the current chat virtual file system. Paths must start with `/`.',
    parameters: {
      $schema: DRAFT_04,
      type: 'object',
      properties: {
        path: pathProperty('Virtual directory path (required)'),
      },
      required: ['path'],
    },
    formatMessage: (args) => `正在列出 ${String(args.path ?? '')}…`,
  },
  {
    name: 'vfs_search',
    displayName: 'VFS Search',
    shortTool: 'search',
    description:
      'Search file contents under a directory in the current chat virtual file system. Use `regex: true` for case-insensitive regex; otherwise substring match.',
    parameters: {
      $schema: DRAFT_04,
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search string (defaults to empty)',
        },
        path: {
          type: 'string',
          description: 'Root directory to search from (default `/`)',
        },
        regex: {
          type: 'boolean',
          description: 'When true, treat query as case-insensitive regex',
        },
      },
    },
    formatMessage: (args) => {
      const q = typeof args.query === 'string' ? args.query : ''
      return q ? `正在搜索「${q}」…` : '正在搜索虚拟文件…'
    },
  },
]

export const VFS_FUNCTION_TOOL_NAMES = VFS_FUNCTION_TOOL_SCHEMAS.map((s) => s.name)

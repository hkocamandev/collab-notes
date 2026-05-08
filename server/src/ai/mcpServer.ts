// MCP server exposing a single tool: `search_documents`. Built with
// @modelcontextprotocol/sdk. Wired up but not bound to a transport in this
// process — production traffic from the web app goes through the REST
// endpoint, which calls `searchDocuments` directly. The MCP server is here
// so an external MCP client (e.g. Claude Desktop) could connect to a stdio
// entrypoint in the future and use the exact same tool implementation.
//
// The point of going through MCP at all: it standardises the contract so
// any AI agent that speaks MCP can call into our document search without
// us inventing a custom RPC.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchDocuments } from './searchDocuments.js';

// Builds a fresh MCP server bound to a specific user. Userless tool calls
// would be a security hole — every MCP request must be scoped to whoever
// authenticated.
export function createMcpServer(userId: string) {
  const server = new Server(
    { name: 'collab-notes', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_documents',
        description:
          'Semantically search the current user\'s accessible documents (owned + shared) and return the top matches by title.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Free-text query to match against document content.',
            },
            limit: {
              type: 'number',
              description: 'Max number of results (default 5).',
              default: 5,
            },
          },
          required: ['query'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    if (request.params.name !== 'search_documents') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    const args = request.params.arguments as { query: string; limit?: number };
    const results = await searchDocuments(userId, args.query, args.limit ?? 5);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  });

  return server;
}

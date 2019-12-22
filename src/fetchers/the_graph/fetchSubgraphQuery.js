// parse and dispatch GraphQL query to The Graph

export const fetchSubgraphQuery = async (subgraph, query) => {
  // remove unnecessary chars
  const filteredQuery = stripGraphQLQuery(query);
  const response = await fetch(
    'https://api.thegraph.com/subgraphs/name/' + subgraph,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: filteredQuery })
    }
  );
  if (!response.ok)
    throw new Error('Failed fetching thegraph.com API ' + response);
  const responseJSON = await response.json();
  return responseJSON;
};

const stripGraphQLQuery = graphQLQuery =>
  graphQLQuery
    .replace(/#.*\n/g, '')
    .replace(/[\s|,]*\n+[\s|,]*/g, ' ')
    .replace(/:\s/g, ':')
    .replace(/,\s/g, ',')
    .replace(/\)\s\{/g, '){')
    .replace(/\}\s/g, '}')
    .replace(/\{\s/g, '{')
    .replace(/\s\}/g, '}')
    .replace(/\s\{/g, '{')
    .replace(/\)\s/g, ')')
    .replace(/\(\s/g, '(')
    .replace(/\s\)/g, ')')
    .replace(/\s\(/g, '(')
    .replace(/=\s/g, '=')
    .replace(/\s=/g, '=')
    .replace(/@\s/g, '@')
    .replace(/\s@/g, '@')
    .replace(/\s\$/g, '$')
    .replace(/\s\./g, '.')
    .trim();

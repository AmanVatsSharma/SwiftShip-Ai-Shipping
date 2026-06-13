'use client';

import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';

const GRAPHQL_URL =
  (typeof window !== 'undefined' && (window as any).NEXT_PUBLIC_API_URL) ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3000/graphql';

const httpLink = new HttpLink({ uri: GRAPHQL_URL });

const authLink = setContext((_, { headers }) => {
  if (typeof window === 'undefined') return { headers };
  const token = window.localStorage.getItem('swiftship.jwt');
  return {
    headers: {
      ...(headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const e of graphQLErrors) {
      // eslint-disable-next-line no-console
      console.error('[graphql]', e.message, e.path);
    }
  }
  if (networkError) {
    // eslint-disable-next-line no-console
    console.error('[network]', networkError);
  }
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
});

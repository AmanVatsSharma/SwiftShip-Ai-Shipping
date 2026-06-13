'use client';

import { ApolloClient, InMemoryCache, HttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/graphql';

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

export const apolloClient = new ApolloClient({
  link: from([authLink, httpLink]),
  cache: new InMemoryCache(),
});

import { ActivityIndicator } from 'react-native';

import { Button } from '@/components/ui';

export interface LoadMoreProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/** Footer for paged lists: a "Load more" button, or a spinner while the next page loads. */
export function LoadMore({ hasNextPage, isFetchingNextPage, onLoadMore }: LoadMoreProps) {
  if (isFetchingNextPage) return <ActivityIndicator className="py-4 text-primary" />;
  if (!hasNextPage) return null;
  return <Button title="Load more" variant="outline" size="sm" onPress={onLoadMore} />;
}

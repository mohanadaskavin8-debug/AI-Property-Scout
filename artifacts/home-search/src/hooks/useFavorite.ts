import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import {
  Property,
  useAddFavorite,
  useRemoveFavorite,
  useListFavorites,
  getListFavoritesQueryKey,
} from "@workspace/api-client-react";

export function useFavorite(property: Property) {
  const { isSignedIn, isLoaded } = useAuth();
  const [, navigate] = useLocation();
  const { data: favorites, refetch } = useListFavorites({
    query: { enabled: !!isSignedIn, queryKey: getListFavoritesQueryKey() },
  });
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const fav = favorites?.find((f) => f.propertyData.id === property.id);
  const isFavorite = !!fav;
  const isBusy = addFavorite.isPending || removeFavorite.isPending;

  async function toggle() {
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate("/sign-in");
      return;
    }
    if (fav) {
      await removeFavorite.mutateAsync({ id: fav.id });
    } else {
      await addFavorite.mutateAsync({ data: { propertyData: property } });
    }
    refetch();
  }

  return { isFavorite, toggle, isBusy, isSignedIn };
}

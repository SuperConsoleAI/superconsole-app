import { component$, useContext } from "@builder.io/qwik";
import { ProductAnalytics } from "~/components/ProductAnalytics";
import { StoreContext } from "../../layout";

export default component$(() => {
  const store = useContext(StoreContext);

  return (
    <div class="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* 
        Header is handled by the global AppTopbar and the StoreTabs
        which are injected at the top. We only render the page content here.
      */}
      {store.loading ? (
        <div class="stats-grid" style="margin-bottom:var(--space-lg)">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} class="stat-card">
              <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px" />
              <div class="skeleton" style="height:32px;width:60px" />
            </div>
          ))}
        </div>
      ) : (
        <ProductAnalytics 
          analyticsRows={store.analyticsData.filter((a: any) => {
            const product = store.products.find((p: any) => p.id === a.product_id);
            return product && (product.product_type === "event" || product.category_id === "event");
          })} 
          products={store.products.filter((p: any) => p.product_type === "event" || p.category_id === "event")} 
        />
      )}
    </div>
  );
});

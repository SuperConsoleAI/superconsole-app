import { component$, useContext } from "@builder.io/qwik";
import { ProductSales } from "~/components/ProductSales";
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
        <ProductSales 
          sales={store.salesData.filter((s: any) => s.product_type === "webinar" || s.product_type === null)} 
          products={store.products.filter((p: any) => p.product_type === "webinar" || p.category_id === "webinar")} 
          productTypeFilterValue="webinar" 
        />
      )}
    </div>
  );
});

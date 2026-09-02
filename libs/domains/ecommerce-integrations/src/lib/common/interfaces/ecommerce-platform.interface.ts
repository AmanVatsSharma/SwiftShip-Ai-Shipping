/**
 * Generic interface for eCommerce platform integrations
 *
 * This interface defines the standard methods that all eCommerce platform
 * integrations must implement, allowing for a consistent way to interact
 * with different platforms (Shopify, WooCommerce, Magento, etc.)
 */
export interface EcommercePlatform<
  TStore = any,
  TOrder = any,
  TProduct = any,
  TConnectInput = any,
> {
  /**
   * Connect to a store on the eCommerce platform
   * @param connectInput Store connection details
   * @returns The connected store information
   */
  connectStore(connectInput: TConnectInput): Promise<TStore>;

  /**
   * Get all stores connected to the platform
   * @returns List of connected stores
   */
  getStores(): Promise<TStore[]>;

  /**
   * Get a specific store by ID
   * @param id Store identifier
   * @returns Store information
   */
  getStoreById(id: string): Promise<TStore>;

  /**
   * Disconnect/remove a store connection
   * @param id Store identifier
   * @returns The disconnected store information
   */
  disconnectStore(id: string): Promise<TStore>;

  /**
   * Synchronize orders from the eCommerce platform
   * @param storeId Store identifier
   * @returns List of synchronized orders or their IDs
   */
  syncOrders(storeId: string): Promise<TOrder[]>;

  /**
   * Get products from the eCommerce platform
   * @param storeId Store identifier
   * @returns List of products
   */
  getProducts(storeId: string): Promise<TProduct[]>;

  /**
   * Verify that the provided credentials for the platform are valid
   * @param credentials Platform-specific authentication credentials
   */
  verifyCredentials(credentials: TConnectInput): Promise<void>;
}

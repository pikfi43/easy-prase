import { Schema, model } from 'mongoose';

export type Role = 'user' | 'supplier' | 'admin';

export type UserDoc = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  category: string;
  city: string;
  phone?: string;
  notificationSettings?: Record<string, boolean>;
  blocked?: boolean;
};

const userSchema = new Schema<UserDoc>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'supplier', 'admin'], default: 'user' },
  category: { type: String, default: 'Обычный житель' },
  city: { type: String, required: true },
  phone: { type: String, default: '' },
  notificationSettings: { type: Object, default: {} },
  blocked: { type: Boolean, default: false },
}, { versionKey: false });

export const UserModel = model<UserDoc>('User', userSchema);

export type OrganizationDoc = {
  id: string;
  name: string;
  category: string;
  description: string;
  address: string;
  addressText?: string;
  addressResolvedAt?: string;
  addressSource?: 'osm' | 'nominatim' | 'supplier' | '';
  city: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  workingHours?: string;
  cuisine?: string;
  brand?: string;
  operator?: string;
  wheelchair?: string;
  delivery?: string;
  takeaway?: string;
  internetAccess?: string;
  aliases?: string[];
  ratingAverage?: number;
  ratingCount?: number;
  verifiedOwnerId?: string;
  photos?: string[];
  ownerId: string;
  osmId?: string;
  osmType?: 'node' | 'way' | 'relation';
  source?: 'supplier' | 'osm' | 'imported';
  verified?: boolean;
  businessType?: 'ИП' | 'ТОО' | 'АО' | 'Другое';
  bin?: string;
  email?: string;
  legalName?: string;
  legalAddress?: string;
  representativeName?: string;
  representativePosition?: string;
  verificationStatus?: 'draft' | 'pending_verification' | 'verified' | 'rejected' | 'suspended';
  claimOsmId?: string;
  status: 'pending_review' | 'published' | 'rejected' | 'blocked';
  rejectReason?: string;
};

const organizationSchema = new Schema<OrganizationDoc>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  address: { type: String, required: true },
  addressText: { type: String, default: '' },
  addressResolvedAt: { type: String, default: '' },
  addressSource: { type: String, enum: ['osm', 'nominatim', 'supplier', ''], default: '' },
  city: { type: String, required: true },
  lat: { type: Number },
  lng: { type: Number },
  phone: { type: String, default: '' },
  website: { type: String, default: '' },
  workingHours: { type: String, default: '' },
  cuisine: { type: String, default: '' },
  brand: { type: String, default: '' },
  operator: { type: String, default: '' },
  wheelchair: { type: String, default: '' },
  delivery: { type: String, default: '' },
  takeaway: { type: String, default: '' },
  internetAccess: { type: String, default: '' },
  aliases: { type: [String], default: [] },
  ratingAverage: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  verifiedOwnerId: { type: String, default: '' },
  photos: { type: [String], default: [] },
  ownerId: { type: String, required: true },
  osmId: { type: String },
  osmType: { type: String, enum: ['node', 'way', 'relation'] },
  source: { type: String, enum: ['supplier', 'osm', 'imported'], default: 'supplier' },
  verified: { type: Boolean, default: false },
  businessType: { type: String, enum: ['ИП', 'ТОО', 'АО', 'Другое'] },
  bin: { type: String },
  email: { type: String, default: '' },
  legalName: { type: String },
  legalAddress: { type: String, default: '' },
  representativeName: { type: String },
  representativePosition: { type: String },
  verificationStatus: { type: String, enum: ['draft', 'pending_verification', 'verified', 'rejected', 'suspended'], default: 'pending_verification' },
  claimOsmId: { type: String },
  status: { type: String, enum: ['pending_review', 'published', 'rejected', 'blocked'], default: 'pending_review' },
  rejectReason: { type: String, default: '' },
}, { versionKey: false });

export const OrganizationModel = model<OrganizationDoc>('Organization', organizationSchema);

export type PromotionDoc = {
  id: string;
  title: string;
  description: string;
  organizationId?: string;
  place: string;
  categoryId: string;
  type: string;
  value: string;
  oldPrice?: number;
  newPrice?: number;
  discountSize?: number;
  promoCode?: string;
  image?: string;
  startDate: string;
  endDate: string;
  ownerId: string;
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'expired';
  rejectReason?: string;
  city: string;
  views?: number;
  clicks?: number;
  routes?: number;
};

const promotionSchema = new Schema<PromotionDoc>({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  organizationId: { type: String },
  place: { type: String, required: true },
  categoryId: { type: String, required: true },
  type: { type: String, default: 'temporary' },
  value: { type: String, default: '' },
  oldPrice: { type: Number },
  newPrice: { type: Number },
  discountSize: { type: Number },
  promoCode: { type: String },
  image: { type: String, default: '' },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  ownerId: { type: String, required: true },
  status: { type: String, enum: ['draft', 'pending_review', 'published', 'rejected', 'expired'], default: 'pending_review' },
  rejectReason: { type: String, default: '' },
  city: { type: String, required: true },
  views: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  routes: { type: Number, default: 0 },
}, { versionKey: false });

export const PromotionModel = model<PromotionDoc>('Promotion', promotionSchema);

export type CategoryDoc = { id: string; title: string; kind: 'organization' | 'product' | 'promotion'; slug: string };

const categorySchema = new Schema<CategoryDoc>({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  kind: { type: String, enum: ['organization', 'product', 'promotion'], required: true },
  slug: { type: String, required: true },
}, { versionKey: false });

export const CategoryModel = model<CategoryDoc>('Category', categorySchema);

export type ProductDoc = {
  id: string;
  organizationId?: string;
  title: string;
  description: string;
  price: number;
  oldPrice?: number;
  categoryId: string;
  image?: string;
  available?: boolean;
  city: string;
  status: 'draft' | 'pending_review' | 'published' | 'rejected';
  rejectReason?: string;
  normalizedName?: string;
  brand?: string;
  model?: string;
  barcode?: string;
  unit?: string;
  volume?: string;
  weight?: string;
  modelCode?: string;
  rating?: number;
  reviewsCount?: number;
  stockStatus?: string;
  externalId?: string;
  source?: string;
  sourceCity?: string;
  cityVerified?: boolean;
  demo?: boolean;
  externalUrl?: string;
  fetchedAt?: string;
};

const productSchema = new Schema<ProductDoc>({
  id: { type: String, required: true, unique: true },
  organizationId: { type: String },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  oldPrice: { type: Number },
  categoryId: { type: String, required: true },
  image: { type: String, default: '' },
  available: { type: Boolean, default: true },
  city: { type: String, required: true },
  status: { type: String, enum: ['draft', 'pending_review', 'published', 'rejected'], default: 'pending_review' },
  rejectReason: { type: String, default: '' },
  normalizedName: { type: String, index: true },
  brand: { type: String, default: '' },
  model: { type: String, default: '' },
  barcode: { type: String, default: '' },
  unit: { type: String, default: '' },
  volume: { type: String, default: '' },
  weight: { type: String, default: '' },
  modelCode: { type: String, default: '', index: true },
  rating: { type: Number },
  reviewsCount: { type: Number },
  stockStatus: { type: String, default: 'unknown' },
  externalId: { type: String, default: '' },
  source: { type: String, default: 'supplier' },
  sourceCity: { type: String, default: '' },
  cityVerified: { type: Boolean, default: false },
  demo: { type: Boolean, default: false },
  externalUrl: { type: String, default: '' },
  fetchedAt: { type: String, default: '' },
}, { versionKey: false });

export const ProductModel = model<ProductDoc>('Product', productSchema);

export type NotificationDoc = {
  id: string;
  userId: string;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  createdAt: string;
  link?: string;
};

const notificationSchema = new Schema<NotificationDoc>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  kind: { type: String, default: 'system' },
  read: { type: Boolean, default: false },
  createdAt: { type: String, required: true },
  link: { type: String, default: '' },
}, { versionKey: false });

export const NotificationModel = model<NotificationDoc>('Notification', notificationSchema);

export type FavoriteDoc = { userId: string; targetType: 'organization' | 'promotion' | 'product'; targetId: string };

const favoriteSchema = new Schema<FavoriteDoc>({
  userId: { type: String, required: true },
  targetType: { type: String, enum: ['organization', 'promotion', 'product'], required: true },
  targetId: { type: String, required: true },
}, { versionKey: false });

favoriteSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

export const FavoriteModel = model<FavoriteDoc>('Favorite', favoriteSchema);

export type EventDoc = { id: string; title: string; description: string; date: string; address: string; ownerId: string; city: string };

const eventSchema = new Schema<EventDoc>({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: String, required: true },
  address: { type: String, default: '' },
  ownerId: { type: String, required: true },
  city: { type: String, required: true },
}, { versionKey: false });

export const EventModel = model<EventDoc>('Event', eventSchema);

export type StoreOfferDoc = {
  id: string;
  productId: string;
  organizationId?: string;
  source: string;
  externalId?: string;
  externalUrl?: string;
  price: number;
  oldPrice?: number;
  discountPercent?: number;
  stockStatus?: string;
  sourceCity: string;
  cityVerified: boolean;
  demo: boolean;
  fetchedAt: string;
  lastVerifiedAt?: string;
};

const storeOfferSchema = new Schema<StoreOfferDoc>({
  id: { type: String, required: true, unique: true },
  productId: { type: String, required: true, index: true },
  organizationId: { type: String, index: true },
  source: { type: String, required: true, index: true },
  externalId: { type: String },
  externalUrl: { type: String, default: '' },
  price: { type: Number, required: true },
  oldPrice: { type: Number },
  discountPercent: { type: Number },
  stockStatus: { type: String, default: 'unknown' },
  sourceCity: { type: String, required: true },
  cityVerified: { type: Boolean, default: false },
  demo: { type: Boolean, default: false },
  fetchedAt: { type: String, required: true },
  lastVerifiedAt: { type: String },
}, { versionKey: false });
storeOfferSchema.index({ source: 1, externalId: 1 }, { unique: true, sparse: true });
export const StoreOfferModel = model<StoreOfferDoc>('StoreOffer', storeOfferSchema);

export type SourceStoreMappingDoc = {
  id: string;
  source: string;
  organizationId: string;
  city: string;
  verified: boolean;
  aliases: string[];
  updatedAt: string;
};
const sourceStoreMappingSchema = new Schema<SourceStoreMappingDoc>({
  id: { type: String, required: true, unique: true },
  source: { type: String, required: true },
  organizationId: { type: String, required: true, index: true },
  city: { type: String, required: true },
  verified: { type: Boolean, default: false },
  aliases: { type: [String], default: [] },
  updatedAt: { type: String, required: true },
}, { versionKey: false });
sourceStoreMappingSchema.index({ source: 1, city: 1 }, { unique: true });
export const SourceStoreMappingModel = model<SourceStoreMappingDoc>('SourceStoreMapping', sourceStoreMappingSchema);

export type ReviewDoc = {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  rating: number;
  text: string;
  photos: string[];
  createdAt: string;
  updatedAt: string;
  status: 'published' | 'hidden' | 'removed';
};
const reviewSchema = new Schema<ReviewDoc>({
  id: { type: String, required: true, unique: true },
  organizationId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  userName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, default: '', maxlength: 3000 },
  photos: { type: [String], default: [] },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  status: { type: String, enum: ['published', 'hidden', 'removed'], default: 'published', index: true },
}, { versionKey: false });
reviewSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
export const ReviewModel = model<ReviewDoc>('Review', reviewSchema);

export type PriceHistoryDoc = { id: string; productId: string; offerId: string; price: number; oldPrice?: number; timestamp: string; source: string };
const priceHistorySchema = new Schema<PriceHistoryDoc>({
  id: { type: String, required: true, unique: true },
  productId: { type: String, required: true, index: true },
  offerId: { type: String, required: true, index: true },
  price: { type: Number, required: true },
  oldPrice: { type: Number },
  timestamp: { type: String, required: true },
  source: { type: String, required: true },
}, { versionKey: false });
export const PriceHistoryModel = model<PriceHistoryDoc>('PriceHistory', priceHistorySchema);

export type ImportLogDoc = {
  id: string; source: string; startedAt: string; finishedAt?: string; itemsFetched: number;
  itemsAdded: number; itemsUpdated: number; itemsSkipped: number; errors: string[];
  status: 'RUNNING' | 'SUCCESS' | 'IMPORT_FAILED';
};
const importLogSchema = new Schema<ImportLogDoc>({
  id: { type: String, required: true, unique: true }, source: { type: String, required: true, index: true },
  startedAt: { type: String, required: true }, finishedAt: { type: String }, itemsFetched: { type: Number, default: 0 },
  itemsAdded: { type: Number, default: 0 }, itemsUpdated: { type: Number, default: 0 }, itemsSkipped: { type: Number, default: 0 },
  errors: { type: [String], default: [] }, status: { type: String, enum: ['RUNNING', 'SUCCESS', 'IMPORT_FAILED'], required: true },
}, { versionKey: false, suppressReservedKeysWarning: true });
export const ImportLogModel = model<ImportLogDoc>('ImportLog', importLogSchema);

export type AnalyticsEventDoc = { id: string; eventType: 'promotion_view' | 'promotion_click' | 'organization_view' | 'route' | 'offer_click' | 'favorite_add'; organizationId?: string; promotionId?: string; productId?: string; createdAt: string };
const analyticsEventSchema = new Schema<AnalyticsEventDoc>({
  id: { type: String, required: true, unique: true },
  eventType: { type: String, required: true, index: true }, organizationId: { type: String, index: true },
  promotionId: { type: String, index: true }, productId: { type: String, index: true }, createdAt: { type: String, required: true, index: true },
}, { versionKey: false });
export const AnalyticsEventModel = model<AnalyticsEventDoc>('AnalyticsEvent', analyticsEventSchema);

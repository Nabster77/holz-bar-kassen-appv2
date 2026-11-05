import {
  CupSoda, Cookie, Package, Apple, Coffee, Beer, Wine, Sandwich,
  IceCream, Pizza, Cake, Utensils, ShoppingCart, Receipt, Settings,
  Plus, Minus, Trash2, X, Check, Sun, Moon, ArrowLeft, Tag,
  Euro, Clock, Calendar, TrendingUp, Image, Save, Edit3, Search,
  ShoppingBag, Croissant, Salad, Soup, Fish,
  Beef, Drumstick, Egg, Milk, Banana, Cherry, Grape,
  Carrot, Wheat, Candy, Donut, Popcorn,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';

const iconMap: Record<string, ComponentType<LucideProps>> = {
  CupSoda, Cookie, Package, Apple, Coffee, Beer, Wine, Sandwich,
  IceCream, Pizza, Cake, Utensils, ShoppingCart, Receipt, Settings,
  Plus, Minus, Trash2, X, Check, Sun, Moon, ArrowLeft, Tag,
  Euro, Clock, Calendar, TrendingUp, Image, Save, Edit3, Search,
  ShoppingBag, Croissant, Salad, Soup, Fish,
  Beef, Drumstick, Egg, Milk, Banana, Cherry, Grape,
  Carrot, Wheat, Candy, Donut, Popcorn,
};

export const availableIconNames = Object.keys(iconMap).sort();

export function DynamicIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = iconMap[name] ?? Package;
  return <Icon {...props} />;
}

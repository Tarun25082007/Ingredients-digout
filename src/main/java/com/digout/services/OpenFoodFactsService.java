package com.digout.services;

import com.digout.dto.OpenFoodFactsDTO;
import com.digout.dto.ProductSuggestionDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class OpenFoodFactsService {

    private static final Logger log = LoggerFactory.getLogger(OpenFoodFactsService.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private static final int MAX_CACHE_SIZE = 500;
    private final java.util.Map<String, OpenFoodFactsDTO> cache =
            java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<>(128, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(java.util.Map.Entry<String, OpenFoodFactsDTO> eldest) {
                    return size() > MAX_CACHE_SIZE;
                }
            });
    private static final OpenFoodFactsDTO NOT_FOUND_SENTINEL = new OpenFoodFactsDTO("__NOT_FOUND__", "", "", "", java.util.Collections.emptyList());

    private static final String SEARCH_ORG_URL_TEMPLATE = "https://%s.openfoodfacts.org/cgi/search.pl?search_terms=%s&search_simple=1&action=process&json=1&sort_by=popularity_key&page_size=10";
    private static final String SEARCH_NET_URL_TEMPLATE = "https://%s.openfoodfacts.net/cgi/search.pl?search_terms=%s&search_simple=1&action=process&json=1&sort_by=popularity_key&page_size=10";
    private static final String SEARCH_API_URL_TEMPLATE = SEARCH_NET_URL_TEMPLATE;

    public OpenFoodFactsService(@org.springframework.beans.factory.annotation.Qualifier("fastRestTemplate") RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    public OpenFoodFactsDTO searchProductByName(String productName, String countryCode) {
        if (productName == null || productName.trim().isEmpty()) {
            throw new RuntimeException("Product name cannot be empty");
        }
        String cc = sanitizeCountryCode(countryCode);
        String cacheKey = productName.trim().toLowerCase() + "::" + cc;

        OpenFoodFactsDTO cached = cache.get(cacheKey);
        if (cached != null) {
            if ("__NOT_FOUND__".equals(cached.productName())) {
                throw new RuntimeException("No products found matching name: " + productName);
            }
            return cached;
        }

        try {
            OpenFoodFactsDTO result = doSearch(productName, cc);
            
            if (result == null || result.ingredientsText() == null || result.ingredientsText().isBlank()) {
                if (productName.toLowerCase().contains("orea")) {
                    String corrected = productName.toLowerCase().replace("orea", "oreo");
                    OpenFoodFactsDTO fallbackResult = doSearch(corrected, cc);
                    if (fallbackResult != null && fallbackResult.ingredientsText() != null && !fallbackResult.ingredientsText().isBlank()) {
                        cache.put(cacheKey, fallbackResult);
                        return fallbackResult;
                    }
                }
                
                String[] tokens = productName.trim().split("\\s+");
                if (tokens.length > 1) {
                    OpenFoodFactsDTO firstTokenResult = doSearch(tokens[0], cc);
                    if (firstTokenResult != null && firstTokenResult.ingredientsText() != null && !firstTokenResult.ingredientsText().isBlank()) {
                        int relevance = computeRelevanceScore(firstTokenResult.productName(), productName);
                        if (relevance >= 35) {
                            cache.put(cacheKey, firstTokenResult);
                            return firstTokenResult;
                        }
                    }
                }
            }
            
            if (result == null) {
                cache.put(cacheKey, NOT_FOUND_SENTINEL);
                throw new RuntimeException("No products found matching name: " + productName);
            }
            
            cache.put(cacheKey, result);
            return result;

        } catch (HttpClientErrorException.NotFound e) {
            log.warn("Product not found (404) in OpenFoodFacts for name: {}, country: {}", productName, cc);
            throw new RuntimeException("Product not found in region " + cc);
        } catch (ResourceAccessException e) {
            log.warn("Timeout connecting to OpenFoodFacts for product: {}", productName);
            throw new RuntimeException("Timeout connecting to OpenFoodFacts");
        } catch (Exception e) {
            log.error("Error fetching data from OpenFoodFacts for product: {}", productName, e);
            throw new RuntimeException("Error fetching data from OpenFoodFacts: " + e.getMessage());
        }
    }

    private OpenFoodFactsDTO doSearch(String productName, String cc) throws Exception {
        String encodedName = java.net.URLEncoder.encode(productName, java.nio.charset.StandardCharsets.UTF_8);
        String netUrl = String.format(SEARCH_NET_URL_TEMPLATE, cc, encodedName);
        String orgUrl = String.format(SEARCH_ORG_URL_TEMPLATE, cc, encodedName);

        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.set(org.springframework.http.HttpHeaders.USER_AGENT, "IngredientDigoutApp/1.0 (contact@digout.app)");
        org.springframework.http.HttpEntity<String> entity = new org.springframework.http.HttpEntity<>(headers);

        ResponseEntity<String> response = null;
        try {
            response = restTemplate.exchange(netUrl, org.springframework.http.HttpMethod.GET, entity, String.class);
        } catch (Exception exNet) {
            log.warn("OpenFoodFacts .net endpoint failed for '{}', trying .org fallback: {}", productName, exNet.getMessage());
            try {
                response = restTemplate.exchange(orgUrl, org.springframework.http.HttpMethod.GET, entity, String.class);
            } catch (Exception exOrg) {
                log.warn("OpenFoodFacts .org endpoint also failed: {}", exOrg.getMessage());
                return null;
            }
        }

        if (response == null || response.getBody() == null) {
            return null;
        }

        JsonNode root = objectMapper.readTree(response.getBody());
        JsonNode products = root.path("products");
        if (products.isMissingNode() || !products.isArray() || products.size() == 0) {
            return null;
        }

        JsonNode bestProductNode = null;
        int bestScore = -1;

        for (JsonNode node : products) {
            String ingText = node.path("ingredients_text").asText(null);
            if (ingText == null || ingText.trim().isEmpty()) {
                continue;
            }
            if (isBogusIngredientsText(ingText)) {
                continue;
            }

            String candidateName = node.path("product_name").asText("");
            String brand = node.path("brands").asText("");
            String fullName = brand.isBlank() ? candidateName : (brand + " " + candidateName).trim();

            int scoreName = computeRelevanceScore(candidateName, productName);
            int scoreFull = computeRelevanceScore(fullName, productName);

            // True exact match on the actual product name gets top priority
            if (candidateName.trim().equalsIgnoreCase(productName.trim())) {
                scoreName = 150;
            }

            int score;
            if (scoreName > 0) {
                score = Math.max(scoreName, scoreFull);
                // Minor brand bonus if brand aligns with query or candidate
                if (!brand.isBlank() && (brand.toLowerCase().contains(productName.toLowerCase()) || productName.toLowerCase().contains(brand.toLowerCase()))) {
                    score += 10;
                }
            } else if (candidateName.isBlank() || isGenericDescriptor(candidateName)) {
                // If product name was left blank or is just a generic descriptor, consider brand
                int scoreBrand = computeRelevanceScore(brand, productName);
                score = Math.min(scoreBrand, 70);
            } else {
                // Candidate name is a distinct other product (e.g., "Aquafina" when searching for "Pepsi")
                score = 0;
            }

            // Bonus for well-structured and comprehensive ingredients lists
            if (ingText.contains(",")) {
                score += 5;
            }
            int ingredientCount = ingText.split("[,;]").length;
            if (ingredientCount >= 5) {
                score += 10;
            } else if (ingredientCount <= 2 && !productName.toLowerCase().contains("water") && !productName.toLowerCase().contains("salt") && !productName.toLowerCase().contains("sugar")) {
                score -= 30; // Strongly penalize sparse mineral-only or incomplete lists for complex items
            }

            // Ingredient-level sweetness formulation fidelity
            boolean queryWantsDiet = isSweetnessModified(productName);
            boolean candHasSweeteners = containsArtificialSweeteners(ingText);
            boolean candHasRealSugar = containsRealSugar(ingText);

            if (!queryWantsDiet && candHasSweeteners && !candHasRealSugar) {
                score -= 30; // Strongly prefer standard full-sugar formulations for standard queries
            } else if (queryWantsDiet && candHasRealSugar && !candHasSweeteners) {
                score -= 30; // Strongly prefer zero/diet formulations when query explicitly asks for diet/zero
            }

            if (score > bestScore) {
                bestScore = score;
                bestProductNode = node;
            }
        }
        
        // Must meet minimal relevance threshold to avoid unrelated product matching
        if (bestProductNode == null || bestScore < 35) {
            return null;
        }

        String foundProductName = bestProductNode.path("product_name").asText(null);
        String brand = bestProductNode.path("brands").asText("");
        if (foundProductName != null && !brand.isBlank() && !foundProductName.toLowerCase().contains(brand.toLowerCase())) {
            foundProductName = brand + " " + foundProductName;
        }
        String ingredientsText = bestProductNode.path("ingredients_text").asText(null);
        String servingSize = bestProductNode.path("serving_size").asText(null);
        String quantity = bestProductNode.path("quantity").asText(null);
        
        java.util.List<String> countriesTagsList = new java.util.ArrayList<>();
        JsonNode cTagsNode = bestProductNode.path("countries_tags");
        if (cTagsNode.isArray()) {
            for (JsonNode tag : cTagsNode) {
                countriesTagsList.add(tag.asText());
            }
        }

        return new OpenFoodFactsDTO(foundProductName, ingredientsText, servingSize, quantity, countriesTagsList);
    }

    private static final String[] COMMON_FOOD_TERMS = {
        "water", "eau", "aqua", "wasser", "sugar", "sucre", "azucar", "zucker", "zucchero",
        "flour", "farine", "wheat", "oil", "huile", "salt", "sel", "sal", "acid", "acide",
        "syrup", "sirop", "citric", "citrique", "flavor", "flavour", "aroma", "extract", "juice",
        "jus", "milk", "lait", "cream", "butter", "cocoa", "cacao", "starch", "amidon", "corn",
        "soy", "soja", "tea", "coffee", "sodium", "protein", "preservative", "emulsifier",
        "lecithin", "yeast", "vinegar", "spice", "carbonated"
    };

    private boolean isBogusIngredientsText(String text) {
        if (text == null || text.trim().isEmpty()) return true;
        String t = text.trim().toLowerCase();
        if (t.length() < 15) return true;

        // Check for unprintable control chars or C1 control codes (e.g. \u0085)
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (c < 32 && c != '\n' && c != '\r' && c != '\t') return true;
            if (c >= 127 && c <= 159) return true;
        }

        if (t.startsWith("serve chilled") || t.startsWith("best before") 
                || t.startsWith("keep refrigerated") || t.startsWith("store in a cool") 
                || t.startsWith("shake well") || t.startsWith("imported by")) {
            return true;
        }

        // Count meaningful alphanumeric words
        String[] tokens = t.split("[\\s,;()]+");
        int alphaWordCount = 0;
        for (String tok : tokens) {
            if (tok.length() >= 3 && tok.chars().anyMatch(Character::isLetter)) {
                alphaWordCount++;
            }
        }
        if (alphaWordCount < 3) return true;

        // Must contain at least one common food term OR have a well-formed ingredients list with >= 5 words and commas
        boolean hasCommonTerm = false;
        for (String term : COMMON_FOOD_TERMS) {
            if (t.contains(term)) {
                hasCommonTerm = true;
                break;
            }
        }
        if (!hasCommonTerm && (alphaWordCount < 5 || !t.contains(","))) {
            return true;
        }

        return false;
    }

    private static final String[][] VARIANT_DIMENSIONS = {
        // 1. Sweetness / Sugar / Calories
        {"zero", "diet", "free", "light", "lite", "unsweetened", "sugar-free", "sugar free", "no sugar", "no added sugar", "zero sugar", "sans sucre", "sin azucar", "ohne zucker", "senza zucchero", "max"},
        // 2. Fat / Dairy
        {"skim", "skimmed", "nonfat", "non-fat", "fat-free", "fat free", "low-fat", "low fat", "0%", "1%", "2%", "toned", "double toned", "semi-skimmed"},
        // 3. Sodium / Salt
        {"low sodium", "low-sodium", "reduced sodium", "reduced salt", "unsalted", "no salt", "salt-free", "sans sel", "sin sal"},
        // 4. Caffeine
        {"decaf", "decaffeinated", "caffeine-free", "caffeine free", "sans cafeine"},
        // 5. Cooking method / Texture
        {"baked", "air-popped", "air popped", "kettle", "kettle-cooked", "kettle cooked", "roasted"},
        // 6. Grains / Gluten
        {"whole wheat", "whole-wheat", "whole grain", "whole-grain", "multigrain", "gluten-free", "gluten free", "sans gluten"},
        // 7. Plant-based / Dairy alternatives
        {"vegan", "plant-based", "plant based", "dairy-free", "dairy free", "oat milk", "almond milk", "soy milk", "lactose-free", "lactose free"},
        // 8. Extreme Heat / Spice
        {"flamin", "extra hot", "jalapeno", "habanero", "ghost pepper"}
    };

    private boolean checkDimensionMismatch(String candidate, String query) {
        for (String[] dim : VARIANT_DIMENSIONS) {
            boolean qHas = false;
            for (String term : dim) {
                if (query.contains(term)) {
                    qHas = true;
                    break;
                }
            }
            boolean cHas = false;
            for (String term : dim) {
                if (candidate.contains(term)) {
                    cHas = true;
                    break;
                }
            }
            if (qHas != cHas) {
                return true;
            }
        }
        return false;
    }

    private boolean isSweetnessModified(String text) {
        if (text == null) return false;
        String t = text.toLowerCase();
        for (String term : VARIANT_DIMENSIONS[0]) {
            if (t.contains(term)) return true;
        }
        return false;
    }

    private boolean containsArtificialSweeteners(String text) {
        if (text == null) return false;
        String t = text.toLowerCase();
        return t.contains("aspartame") || t.contains("acesulfame") || t.contains("sucralose") 
                || t.contains("saccharin") || t.contains("stevia") || t.contains("erythritol") 
                || t.contains("cyclamate") || t.contains("neotame");
    }

    private boolean containsRealSugar(String text) {
        if (text == null) return false;
        String t = text.toLowerCase();
        return t.contains("sugar") || t.contains("sucre") || t.contains("azucar") 
                || t.contains("zucker") || t.contains("zucchero") || t.contains("corn syrup") 
                || t.contains("glucose") || t.contains("fructose") || t.contains("dextrose")
                || t.contains("invert sugar");
    }

    private int computeRelevanceScore(String candidateName, String query) {
        if (candidateName == null || query == null) return 0;
        String c = candidateName.trim().toLowerCase();
        String q = query.trim().toLowerCase();
        
        if (c.equals(q)) return 100; // Exact match
        
        // Conflicting category keywords: disqualify if candidate has a major food category word NOT in the query
        String[] conflictingCategories = {
            "munch", "cookie", "cookies", "cake", "cupcake", "pie", "muffin", "brownie",
            "chip", "chips", "crisps", "cracker", "bread", "bun", "bagel", "pizza",
            "soup", "sauce", "dressing", "dip", "seasoning", "mix", "dough",
            "pasta", "noodle", "cereal", "water", "aqua", "mineral water", "eau de source"
        };
        boolean conflictFound = false;
        for (String cat : conflictingCategories) {
            if (c.contains(cat) && !q.contains(cat)) {
                conflictFound = true;
                break;
            }
        }
        if (conflictFound) {
            return 20; // Penalized below threshold
        }

        // Multi-dimensional variant fidelity check: prevent comparing regular with diet/skim/baked/decaf
        if (checkDimensionMismatch(c, q)) {
            return 20;
        }

        int score = 0;
        if (c.startsWith(q + " ") || c.startsWith(q + "-") || c.startsWith(q + " -")) {
            score = 90;
        } else if (c.contains(q)) {
            score = 75;
        } else {
            String[] qTokens = q.split("\\s+");
            int matchCount = 0;
            for (String t : qTokens) {
                if (t.length() >= 3 && c.contains(t)) {
                    matchCount++;
                }
            }
            if (matchCount == qTokens.length && qTokens.length > 0) score = 65;
            else if (matchCount > 0) score = 40;
        }

        // Bonus for Original / Classic / Plain when query did not ask for a specialty flavor
        if (score > 0 && (c.contains("original") || c.contains("classic") || c.contains("plain")) 
                && !q.contains("sour") && !q.contains("bbq") && !q.contains("cheese") && !q.contains("onion") && !q.contains("masala")) {
            score += 10;
        }

        return score;
    }

    private boolean isGenericDescriptor(String name) {
        if (name == null || name.isBlank()) return true;
        String n = name.trim().toLowerCase();
        return n.equals("original") || n.equals("classic") || n.equals("regular") || 
               n.equals("drink") || n.equals("beverage") || n.equals("soda") || 
               n.equals("snack") || n.equals("pack") || n.equals("can") || n.equals("bottle");
    }

    private String sanitizeCountryCode(String cc) {
        if (cc == null || cc.isBlank()) return "world";
        String clean = cc.trim().toLowerCase().replaceAll("[^a-z0-9-]", "");
        return (clean.isEmpty() || clean.length() > 32) ? "world" : clean;
    }

    private final java.util.Map<String, java.util.List<ProductSuggestionDTO>> autocompleteCache =
            java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<>(128, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(java.util.Map.Entry<String, java.util.List<ProductSuggestionDTO>> eldest) {
                    return size() > 250;
                }
            });

    private static final java.util.List<String> FRESH_FOOD_ITEMS = java.util.List.of(
        "Fresh Red Apple", "Green Apple", "Banana", "Orange", "Mango", "Strawberries", 
        "Blueberries", "Avocado", "Watermelon", "Papaya", "Pomegranate", "Grapes",
        "Broccoli", "Spinach Salad", "Carrot", "Cucumber Salad", "Tomato",
        "Masala Dosa", "Plain Dosa", "Rava Dosa", "Idli Sambar", "Medu Vada",
        "Dal Tadka", "Dal Makhani", "Paneer Butter Masala", "Palak Paneer", "Paneer Tikka",
        "Chicken Biryani", "Mutton Biryani", "Veg Biryani", "Butter Chicken", "Tandoori Chicken",
        "Chapati / Roti", "Butter Naan", "Garlic Naan", "Aloo Paratha", "Paneer Paratha",
        "Chole Bhature", "Rajma Chawal", "Poha", "Upma", "Khichdi", "Samosa", "Pav Bhaji",
        "Grilled Chicken Salad", "Caesar Salad", "Greek Salad", "Oatmeal with Berries",
        "Greek Yogurt with Honey", "Boiled Eggs", "Scrambled Eggs", "Omelette with Toast",
        "Avocado Toast", "Grilled Salmon", "Margherita Pizza", "Veggie Burger", 
        "Chicken Burger", "French Fries", "Pasta Alfredo", "Spaghetti Bolognese",
        "Filter Coffee", "Masala Chai", "Green Tea", "Fresh Orange Juice", "Mango Lassi",
        "Sweet Lassi", "Buttermilk (Chaas)", "Fresh Coconut Water"
    );

    private static final java.util.List<String> PACKAGED_FOOD_ITEMS = java.util.List.of(
        "Lay's Classic Salted", "Lay's India's Magic Masala", "Lay's American Style Cream & Onion",
        "Kurkure Masala Munch", "Doritos Nacho Cheese", "Pringles Original", "Pringles Sour Cream & Onion",
        "Maggi 2-Minute Noodles", "Maggi Masala Noodles", "Top Ramen Curry", "Knorr Tomato Soup",
        "Oreo Original Sandwich Cookies", "Parle-G Glucose Biscuits", "Britannia Good Day Butter",
        "Britannia Bourbon", "Cadbury Dairy Milk Silk", "KitKat 4-Finger", "Snickers Chocolate Bar",
        "Nutella Hazelnut Spread", "Amul Butter", "Amul Processed Cheese", "Kellogg's Corn Flakes",
        "Quaker Rolled Oats", "Coca-Cola Original", "Coca-Cola Zero Sugar", "Pepsi", "Sprite", "Red Bull Energy Drink"
    );

    public java.util.List<ProductSuggestionDTO> autocompleteProducts(String query, String countryCode) {
        return autocompleteProducts(query, countryCode, null);
    }

    public java.util.List<ProductSuggestionDTO> autocompleteProducts(String query, String countryCode, String category) {
        if (query == null || query.trim().isEmpty()) {
            return java.util.Collections.emptyList();
        }
        
        String cleanQuery = query.trim();
        String cc = sanitizeCountryCode(countryCode);
        String cat = (category != null) ? category.trim().toLowerCase() : "";
        String cacheKey = cleanQuery.toLowerCase() + "::" + cc + "::" + cat;

        java.util.List<ProductSuggestionDTO> cached = autocompleteCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        String encodedQuery = java.net.URLEncoder.encode(cleanQuery, java.nio.charset.StandardCharsets.UTF_8);
        String netUrl = String.format(SEARCH_NET_URL_TEMPLATE, cc, encodedQuery);
        String orgUrl = String.format(SEARCH_ORG_URL_TEMPLATE, cc, encodedQuery);

        java.util.List<ProductSuggestionDTO> suggestions = fetchAutocomplete(netUrl, orgUrl);

        // Augment with global search if regional results are sparse
        if (suggestions.size() < 4 && !"world".equals(cc)) {
            String globalNetUrl = String.format(SEARCH_NET_URL_TEMPLATE, "world", encodedQuery);
            String globalOrgUrl = String.format(SEARCH_ORG_URL_TEMPLATE, "world", encodedQuery);
            java.util.List<ProductSuggestionDTO> globalSuggestions = fetchAutocomplete(globalNetUrl, globalOrgUrl);
            for (ProductSuggestionDTO dto : globalSuggestions) {
                boolean exists = suggestions.stream().anyMatch(s -> s.productName().equalsIgnoreCase(dto.productName()));
                if (!exists) {
                    suggestions.add(dto);
                }
                if (suggestions.size() >= 8) break;
            }
        }

        // Augment with curated suggestions matching the query
        String qLower = cleanQuery.toLowerCase();
        java.util.List<String> targetCuratedList = new java.util.ArrayList<>();
        if ("fresh".equals(cat)) {
            targetCuratedList.addAll(FRESH_FOOD_ITEMS);
            targetCuratedList.addAll(PACKAGED_FOOD_ITEMS);
        } else {
            targetCuratedList.addAll(PACKAGED_FOOD_ITEMS);
            targetCuratedList.addAll(FRESH_FOOD_ITEMS);
        }

        java.util.List<ProductSuggestionDTO> curatedMatches = new java.util.ArrayList<>();
        for (String item : targetCuratedList) {
            if (item.toLowerCase().contains(qLower)) {
                boolean alreadyInList = suggestions.stream().anyMatch(s -> s.productName().equalsIgnoreCase(item));
                if (!alreadyInList) {
                    curatedMatches.add(new ProductSuggestionDTO(item, null));
                }
            }
        }

        // If category is fresh, prioritize curated fresh dishes at the top
        if ("fresh".equals(cat)) {
            curatedMatches.addAll(suggestions);
            suggestions = curatedMatches;
        } else {
            suggestions.addAll(curatedMatches);
        }

        // Deduplicate suggestions preserving order
        java.util.List<ProductSuggestionDTO> deduplicated = new java.util.ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (ProductSuggestionDTO s : suggestions) {
            String norm = s.productName().trim().toLowerCase();
            if (seen.add(norm)) {
                deduplicated.add(s);
            }
            if (deduplicated.size() >= 8) break;
        }

        // Sort suggestions to prioritize closer string matches
        deduplicated.sort((a, b) -> {
            String nameA = a.productName().toLowerCase();
            String nameB = b.productName().toLowerCase();
            
            boolean aExact = nameA.equals(qLower);
            boolean bExact = nameB.equals(qLower);
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            boolean aStartsWith = nameA.startsWith(qLower);
            boolean bStartsWith = nameB.startsWith(qLower);
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            
            boolean aContains = nameA.contains(qLower);
            boolean bContains = nameB.contains(qLower);
            if (aContains && bContains) {
                return Integer.compare(nameA.length(), nameB.length());
            }
            return 0;
        });

        autocompleteCache.put(cacheKey, deduplicated);
        return deduplicated;
    }

    private java.util.List<ProductSuggestionDTO> fetchAutocomplete(String netUrl, String orgUrl) {
        try {
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.set(org.springframework.http.HttpHeaders.USER_AGENT, "DigOutApp - Android - Version 1.0 - www.digout.com");
            org.springframework.http.HttpEntity<String> entity = new org.springframework.http.HttpEntity<>(headers);
            
            ResponseEntity<String> response = null;
            try {
                response = restTemplate.exchange(netUrl, org.springframework.http.HttpMethod.GET, entity, String.class);
            } catch (Exception exNet) {
                log.warn("OpenFoodFacts .net autocomplete failed, trying .org fallback: {}", exNet.getMessage());
                if (orgUrl != null) {
                    try {
                        response = restTemplate.exchange(orgUrl, org.springframework.http.HttpMethod.GET, entity, String.class);
                    } catch (Exception exOrg) {
                        log.warn("OpenFoodFacts .org autocomplete fallback also failed: {}", exOrg.getMessage());
                    }
                }
            }

            if (response == null || response.getBody() == null) {
                return new java.util.ArrayList<>();
            }

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode products = root.path("products");
            java.util.List<ProductSuggestionDTO> suggestions = new java.util.ArrayList<>();
            
            if (!products.isMissingNode() && products.isArray()) {
                for (JsonNode productNode : products) {
                    String name = productNode.path("product_name").asText(null);
                    if (name != null && !name.trim().isEmpty()) {
                        String imageUrl = productNode.path("image_thumb_url").asText(null);
                        suggestions.add(new ProductSuggestionDTO(name, imageUrl));
                        if (suggestions.size() >= 8) break;
                    }
                }
            }
            return suggestions;
        } catch (Exception e) {
            log.warn("Failed to parse autocomplete from OpenFoodFacts: {}", e.getMessage());
            return new java.util.ArrayList<>();
        }
    }
}

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

@Service
public class OpenFoodFactsService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final UsdaFoodDataService usdaFoodDataService;

    private static final String SEARCH_API_URL_TEMPLATE = "https://%s.openfoodfacts.org/cgi/search.pl?search_terms=%s&search_simple=1&action=process&json=1&sort_by=popularity_key";

    public OpenFoodFactsService(RestTemplate restTemplate, ObjectMapper objectMapper, UsdaFoodDataService usdaFoodDataService) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.usdaFoodDataService = usdaFoodDataService;
    }

    public OpenFoodFactsDTO searchProductByName(String productName, String countryCode) {
        String cc = (countryCode != null && !countryCode.trim().isEmpty()) ? countryCode.trim().toLowerCase() : "world";
        
        try {
            OpenFoodFactsDTO result = doSearch(productName, cc);
            
            if (result == null || result.ingredientsText() == null || result.ingredientsText().isBlank()) {
                if (productName.toLowerCase().contains("orea")) {
                    String corrected = productName.toLowerCase().replace("orea", "oreo");
                    OpenFoodFactsDTO fallbackResult = doSearch(corrected, cc);
                    if (fallbackResult != null && fallbackResult.ingredientsText() != null && !fallbackResult.ingredientsText().isBlank()) {
                        return fallbackResult;
                    }
                }
                
                String[] tokens = productName.trim().split("\\s+");
                if (tokens.length > 1) {
                    OpenFoodFactsDTO firstTokenResult = doSearch(tokens[0], cc);
                    if (firstTokenResult != null && firstTokenResult.ingredientsText() != null && !firstTokenResult.ingredientsText().isBlank()) {
                        return firstTokenResult;
                    }
                }
            }
            
            if (result == null) {
                throw new RuntimeException("No products found matching name: " + productName);
            }
            
            return result;

        } catch (HttpClientErrorException.NotFound e) {
            System.out.println("Product not found (404) for name: " + productName);
            throw new RuntimeException("Product not found in region " + cc);
        } catch (ResourceAccessException e) {
            System.out.println("Timeout or connection error when calling OpenFoodFacts.");
            throw new RuntimeException("Timeout connecting to OpenFoodFacts");
        } catch (Exception e) {
            System.out.println("Error fetching data from OpenFoodFacts: " + e.getMessage());
            throw new RuntimeException("Error fetching data from OpenFoodFacts: " + e.getMessage());
        }
    }

    private OpenFoodFactsDTO doSearch(String productName, String cc) throws Exception {
        String encodedName = java.net.URLEncoder.encode(productName, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format(SEARCH_API_URL_TEMPLATE, cc, encodedName) + "&page_size=5";

        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.set(org.springframework.http.HttpHeaders.USER_AGENT, "DigOut/1.0 (https://digout.com; contact@digout.com)");
        org.springframework.http.HttpEntity<String> entity = new org.springframework.http.HttpEntity<>(headers);

        ResponseEntity<String> response = restTemplate.exchange(url, org.springframework.http.HttpMethod.GET, entity, String.class);
        JsonNode root = objectMapper.readTree(response.getBody());

        JsonNode products = root.path("products");
        if (products.isMissingNode() || !products.isArray() || products.size() == 0) {
            return null;
        }

        JsonNode bestProductNode = null;
        for (JsonNode node : products) {
            String ingText = node.path("ingredients_text").asText(null);
            if (ingText != null && !ingText.trim().isEmpty()) {
                bestProductNode = node;
                break;
            }
        }
        
        if (bestProductNode == null) {
            bestProductNode = products.get(0);
        }

        String foundProductName = bestProductNode.path("product_name").asText(null);
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

    public java.util.List<ProductSuggestionDTO> autocompleteProducts(String query, String countryCode) {
        if (query == null || query.trim().isEmpty()) {
            return java.util.Collections.emptyList();
        }
        
        String cc = (countryCode != null && !countryCode.trim().isEmpty()) ? countryCode.trim().toLowerCase() : "world";
        String encodedQuery = java.net.URLEncoder.encode(query, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format(SEARCH_API_URL_TEMPLATE, cc, encodedQuery) + "&page_size=10";

        java.util.List<ProductSuggestionDTO> suggestions = fetchAutocomplete(url);

        // Augment with global search if regional results are sparse
        if (suggestions.size() < 4 && !"world".equals(cc)) {
            String globalUrl = String.format(SEARCH_API_URL_TEMPLATE, "world", encodedQuery) + "&page_size=5";
            java.util.List<ProductSuggestionDTO> globalSuggestions = fetchAutocomplete(globalUrl);
            for (ProductSuggestionDTO dto : globalSuggestions) {
                boolean exists = suggestions.stream().anyMatch(s -> s.productName().equalsIgnoreCase(dto.productName()));
                if (!exists) {
                    suggestions.add(dto);
                }
                if (suggestions.size() >= 8) break;
            }
        }
        // Sort suggestions to prioritize closer string matches, keeping popularity as secondary
        suggestions.sort((a, b) -> {
            String nameA = a.productName().toLowerCase();
            String nameB = b.productName().toLowerCase();
            String q = query.toLowerCase().trim();
            
            boolean aExact = nameA.equals(q);
            boolean bExact = nameB.equals(q);
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            boolean aStartsWith = nameA.startsWith(q);
            boolean bStartsWith = nameB.startsWith(q);
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            
            // Length penalty: shorter names that contain the query are preferred (e.g. "Kit Kat" over "Kit Kat x 10")
            boolean aContains = nameA.contains(q);
            boolean bContains = nameB.contains(q);
            if (aContains && bContains) {
                return Integer.compare(nameA.length(), nameB.length());
            }
            
            return 0;
        });
        
        return suggestions;
    }

    private java.util.List<ProductSuggestionDTO> fetchAutocomplete(String url) {
        try {
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.set(org.springframework.http.HttpHeaders.USER_AGENT, "DigOut/1.0 (https://digout.com; contact@digout.com)");
            org.springframework.http.HttpEntity<String> entity = new org.springframework.http.HttpEntity<>(headers);
            
            ResponseEntity<String> response = restTemplate.exchange(url, org.springframework.http.HttpMethod.GET, entity, String.class);
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
            System.err.println("Failed to fetch autocomplete from OpenFoodFacts: " + e.getMessage());
            return new java.util.ArrayList<>();
        }
    }
}

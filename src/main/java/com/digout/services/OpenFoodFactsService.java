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

    private static final String SEARCH_API_URL_TEMPLATE = "https://%s.openfoodfacts.org/cgi/search.pl?search_terms=%s&search_simple=1&action=process&json=1";

    public OpenFoodFactsService(RestTemplate restTemplate, ObjectMapper objectMapper, UsdaFoodDataService usdaFoodDataService) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.usdaFoodDataService = usdaFoodDataService;
    }

    public OpenFoodFactsDTO searchProductByName(String productName, String countryCode) {
        String encodedName = java.net.URLEncoder.encode(productName, java.nio.charset.StandardCharsets.UTF_8);
        String cc = (countryCode != null && !countryCode.trim().isEmpty()) ? countryCode.trim().toLowerCase() : "world";
        String url = String.format(SEARCH_API_URL_TEMPLATE, cc, encodedName);

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());

            JsonNode products = root.path("products");
            if (products.isMissingNode() || !products.isArray() || products.size() == 0) {
                if (!"world".equals(cc)) {
                    System.out.println("No products found in " + cc + " for name: " + productName + ". Falling back to world data.");
                    return searchProductByName(productName, "world");
                }
                throw new RuntimeException("No products found matching name: " + productName);
            }

            // Take the best match (first product)
            JsonNode productNode = products.get(0);
            String foundProductName = productNode.path("product_name").asText(null);
            String ingredientsText = productNode.path("ingredients_text").asText(null);

            return new OpenFoodFactsDTO(foundProductName, ingredientsText);

        } catch (HttpClientErrorException.NotFound e) {
            if (!"world".equals(cc)) {
                return searchProductByName(productName, "world");
            }
            System.out.println("Product not found (404) for name: " + productName + ". Falling back to USDA database...");
            return usdaFoodDataService.getIngredientsDatabaseFallback(productName);
        } catch (ResourceAccessException e) {
            if (!"world".equals(cc)) {
                return searchProductByName(productName, "world");
            }
            System.out.println("Timeout or connection error when calling OpenFoodFacts. Falling back to USDA database...");
            return usdaFoodDataService.getIngredientsDatabaseFallback(productName);
        } catch (Exception e) {
            if (!"world".equals(cc)) {
                return searchProductByName(productName, "world");
            }
            System.out.println("Error fetching data from OpenFoodFacts: " + e.getMessage() + ". Falling back to USDA database...");
            return usdaFoodDataService.getIngredientsDatabaseFallback(productName);
        }
    }

    public java.util.List<ProductSuggestionDTO> autocompleteProducts(String query) {
        if (query == null || query.trim().isEmpty()) {
            return java.util.Collections.emptyList();
        }
        
        String encodedQuery = java.net.URLEncoder.encode(query, java.nio.charset.StandardCharsets.UTF_8);
        String url = String.format(SEARCH_API_URL_TEMPLATE, "world", encodedQuery) + "&page_size=5";

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());

            JsonNode products = root.path("products");
            java.util.List<ProductSuggestionDTO> suggestions = new java.util.ArrayList<>();
            
            if (!products.isMissingNode() && products.isArray()) {
                for (JsonNode productNode : products) {
                    String name = productNode.path("product_name").asText(null);
                    if (name != null && !name.trim().isEmpty()) {
                        String imageUrl = productNode.path("image_thumb_url").asText(null);
                        suggestions.add(new ProductSuggestionDTO(name, imageUrl));
                        if (suggestions.size() >= 5) break;
                    }
                }
            }
            return suggestions;
        } catch (Exception e) {
            System.err.println("Failed to autocomplete from OpenFoodFacts: " + e.getMessage());
            return java.util.Collections.emptyList();
        }
    }
}

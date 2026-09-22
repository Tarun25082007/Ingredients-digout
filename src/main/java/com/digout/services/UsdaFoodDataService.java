package com.digout.services;

import com.digout.dto.OpenFoodFactsDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class UsdaFoodDataService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String usdaApiKey;
    
    private static final String USDA_API_URL_TEMPLATE = "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=%s&query=%s&dataType=Foundation,SR%%20Legacy,Survey%%20(FNDDS)&pageSize=1";
    private static final String USDA_BRANDED_API_URL_TEMPLATE = "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=%s&query=%s&dataType=Branded,Foundation,SR%%20Legacy&pageSize=5";

    public UsdaFoodDataService(RestTemplate restTemplate, ObjectMapper objectMapper, @Value("${usda.api.key}") String usdaApiKey) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.usdaApiKey = usdaApiKey;
    }

    public OpenFoodFactsDTO searchAnyProductByName(String productName) {
        if (usdaApiKey == null || usdaApiKey.isBlank()) {
            return null;
        }
        try {
            String encodedName = java.net.URLEncoder.encode(productName, java.nio.charset.StandardCharsets.UTF_8);
            String url = String.format(USDA_BRANDED_API_URL_TEMPLATE, usdaApiKey, encodedName);

            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode foods = root.path("foods");

            if (!foods.isMissingNode() && foods.isArray() && foods.size() > 0) {
                for (JsonNode food : foods) {
                    String ingredients = food.path("ingredients").asText(null);
                    if (ingredients != null && !ingredients.isBlank()) {
                        String foundName = food.path("description").asText(productName);
                        String serving = food.has("servingSize") 
                                ? food.path("servingSize").asText() + " " + food.path("servingSizeUnit").asText("") 
                                : null;
                        return new OpenFoodFactsDTO(foundName, ingredients, serving, null, null);
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("USDA branded search failed for " + productName + ": " + e.getMessage());
        }
        return null;
    }

    public OpenFoodFactsDTO searchFreshProductByName(String productName) {
        try {
            String encodedName = java.net.URLEncoder.encode(productName, java.nio.charset.StandardCharsets.UTF_8);
            String url = String.format(USDA_API_URL_TEMPLATE, usdaApiKey, encodedName);

            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode foods = root.path("foods");

            if (foods.isMissingNode() || !foods.isArray() || foods.size() == 0) {
                throw new RuntimeException("No products found in USDA database matching name: " + productName);
            }

            JsonNode firstFood = foods.get(0);
            String foundProductName = firstFood.path("description").asText(productName);
            String ingredientsText = firstFood.path("ingredients").asText("");

            return new OpenFoodFactsDTO(foundProductName, ingredientsText, null, null, null);
        } catch (Exception e) {
            System.err.println("Fallback USDA database failed: " + e.getMessage());
            // If even the fallback fails, return empty ingredients so the AI attempts to guess them
            return new OpenFoodFactsDTO(productName, "", null, null, null);
        }
    }
}

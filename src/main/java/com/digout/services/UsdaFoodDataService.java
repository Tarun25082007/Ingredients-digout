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
    
    private static final String USDA_API_URL_TEMPLATE = "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=%s&query=%s&dataType=Branded&pageSize=1";

    public UsdaFoodDataService(RestTemplate restTemplate, ObjectMapper objectMapper, @Value("${usda.api.key}") String usdaApiKey) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.usdaApiKey = usdaApiKey;
    }

    public OpenFoodFactsDTO getIngredientsDatabaseFallback(String productName) {
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

            return new OpenFoodFactsDTO(foundProductName, ingredientsText, null, null);
        } catch (Exception e) {
            System.err.println("Fallback USDA database failed: " + e.getMessage());
            // If even the fallback fails, return empty ingredients so the AI attempts to guess them
            return new OpenFoodFactsDTO(productName, "", null, null);
        }
    }
}

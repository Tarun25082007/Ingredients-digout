package com.digout.services;

import com.digout.dto.OpenFoodFactsDTO;
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

    private static final String API_URL_TEMPLATE = "https://world.openfoodfacts.org/api/v2/product/%s.json";

    public OpenFoodFactsService(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    public OpenFoodFactsDTO fetchInternationalVariants(String barcode) {
        String url = String.format(API_URL_TEMPLATE, barcode);

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());

            String status = root.path("status").asText();
            if (!"1".equals(status) && !"success".equalsIgnoreCase(status)) {
                throw new RuntimeException("Product not found in OpenFoodFacts");
            }

            JsonNode productNode = root.path("product");
            String productName = productNode.path("product_name").asText(null);
            String ingredientsText = productNode.path("ingredients_text").asText(null);

            return new OpenFoodFactsDTO(productName, ingredientsText);

        } catch (HttpClientErrorException.NotFound e) {
            throw new RuntimeException("Product not found (404) for barcode: " + barcode, e);
        } catch (ResourceAccessException e) {
            throw new RuntimeException("Timeout or connection error when calling OpenFoodFacts", e);
        } catch (Exception e) {
            throw new RuntimeException("Error fetching data from OpenFoodFacts", e);
        }
    }
}

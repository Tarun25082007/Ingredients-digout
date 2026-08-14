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

    private static final String SEARCH_API_URL_TEMPLATE = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=%s&search_simple=1&action=process&json=1";

    public OpenFoodFactsService(RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    public OpenFoodFactsDTO searchProductByName(String productName) {
        // Replace spaces with + for URL encoding
        String encodedName = productName.replace(" ", "+");
        String url = String.format(SEARCH_API_URL_TEMPLATE, encodedName);

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            JsonNode root = objectMapper.readTree(response.getBody());

            JsonNode products = root.path("products");
            if (products.isMissingNode() || !products.isArray() || products.size() == 0) {
                throw new RuntimeException("No products found matching name: " + productName);
            }

            // Take the best match (first product)
            JsonNode productNode = products.get(0);
            String foundProductName = productNode.path("product_name").asText(null);
            String ingredientsText = productNode.path("ingredients_text").asText(null);

            return new OpenFoodFactsDTO(foundProductName, ingredientsText);

        } catch (HttpClientErrorException.NotFound e) {
            throw new RuntimeException("Product not found (404) for name: " + productName, e);
        } catch (ResourceAccessException e) {
            throw new RuntimeException("Timeout or connection error when calling OpenFoodFacts", e);
        } catch (Exception e) {
            throw new RuntimeException("Error fetching data from OpenFoodFacts", e);
        }
    }
}

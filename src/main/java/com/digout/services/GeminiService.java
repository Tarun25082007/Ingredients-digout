package com.digout.services;

import com.digout.dto.WhoAssessmentDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
public class GeminiService {

    private final String geminiApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final GroqService groqService;

    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions?key=";
    private static final String PROMPT = "Extract every ingredient from this image. Evaluate them against WHO guidelines. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String\", \"globalEquivalent\": \"String (highly popular global equivalent brand/product if this is regional, e.g. 'Fanta Orange' for 'Campa Orange', else same as productName)\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }. Ensure 'status' is strictly RED, YELLOW, or GREEN.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named '%s'. Note that the name provided may be misspelled, incomplete, or inexact. Please intelligently deduce the intended product. Use your knowledge base to infer its typical ingredients. If it is a highly regional product, identify its globally popular equivalent and base the ingredients and analysis on that. Evaluate them against WHO guidelines. You MUST output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String (the actual corrected/identified product name)\", \"globalEquivalent\": \"String (the globally popular equivalent if regional)\", \"ingredientsFound\": [ { \"name\": \"String\", \"explanation\": \"String (health impact)\", \"status\": \"RED or YELLOW or GREEN\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"RED or YELLOW or GREEN\", \"explanation\": \"String\" } ], \"overallIndicator\": \"RED or YELLOW or GREEN\" }. Ensure 'status' is strictly RED, YELLOW, or GREEN.";

    public GeminiService(@Value("${gemini.api.key}") String geminiApiKey, RestTemplate restTemplate, ObjectMapper objectMapper, GroqService groqService) {
        this.geminiApiKey = geminiApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.groqService = groqService;
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredients(String base64Image, String mimeType) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                // Construct Gemini Interactions API Payload
                Map<String, Object> payload = Map.of(
                        "model", "gemini-3.7-flash",
                        "store", false,
                        "input", List.of(
                                Map.of(
                                        "type", "text",
                                        "text", PROMPT
                                ),
                                Map.of(
                                        "type", "image",
                                        "mime_type", mimeType,
                                        "data", base64Image
                                )
                        )
                );

                HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
                ResponseEntity<String> response = restTemplate.postForEntity(GEMINI_API_URL + geminiApiKey, request, String.class);

                // Parse the response
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode steps = root.path("steps");
                String jsonText = "";
                
                for (JsonNode step : steps) {
                    if ("model_output".equals(step.path("type").asText()) && step.has("content")) {
                        JsonNode contentArray = step.path("content");
                        if (contentArray.isArray() && contentArray.size() > 0) {
                            JsonNode firstContent = contentArray.get(0);
                            if (firstContent.has("text")) {
                                jsonText = firstContent.path("text").asText();
                                break;
                            }
                        }
                    } else if (step.has("modelOutput") && step.path("modelOutput").has("text")) {
                        // Fallback for mock responses or older schema
                        jsonText = step.path("modelOutput").path("text").asText();
                        break;
                    }
                }

                if (jsonText == null || jsonText.trim().isEmpty()) {
                    throw new RuntimeException("No model_output found in response: " + response.getBody());
                }

                jsonText = extractJson(jsonText);
                return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        System.out.println("Gemini Overload or Timeout! Retrying in 2s... (Attempt " + (i+1) + "/" + maxRetries + ")");
                        Thread.sleep(2000); // wait 2 seconds before retrying
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     System.out.println("Gemini Rate Limit reached! Falling back to GroqService...");
                     return groqService.analyzeIngredients(base64Image, mimeType);
                }
                
                System.out.println("Gemini failed, falling back to GroqService: " + e.getMessage());
                return groqService.analyzeIngredients(base64Image, mimeType);
            }
        }
        System.out.println("Gemini exhausted retries, falling back to GroqService...");
        return groqService.analyzeIngredients(base64Image, mimeType);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                // Construct Gemini Interactions API Payload for Text-Only
                String formattedPrompt = String.format(TEXT_PROMPT, productName.replace("'", ""));
                Map<String, Object> payload = Map.of(
                        "model", "gemini-3.7-flash",
                        "store", false,
                        "input", List.of(
                                Map.of(
                                        "type", "text",
                                        "text", formattedPrompt
                                )
                        )
                );

                HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
                ResponseEntity<String> response = restTemplate.postForEntity(GEMINI_API_URL + geminiApiKey, request, String.class);

                // Parse the response
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode steps = root.path("steps");
                String jsonText = "";

                for (JsonNode step : steps) {
                    if ("model_output".equals(step.path("type").asText()) && step.has("content")) {
                        JsonNode contentArray = step.path("content");
                        if (contentArray.isArray() && contentArray.size() > 0) {
                            JsonNode firstContent = contentArray.get(0);
                            if (firstContent.has("text")) {
                                jsonText = firstContent.path("text").asText();
                                break;
                            }
                        }
                    } else if (step.has("modelOutput") && step.path("modelOutput").has("text")) {
                        jsonText = step.path("modelOutput").path("text").asText();
                        break;
                    }
                }

                if (jsonText == null || jsonText.trim().isEmpty()) {
                    throw new RuntimeException("No model_output found in response: " + response.getBody());
                }

                jsonText = extractJson(jsonText);
                return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        System.out.println("Gemini Overload or Timeout! Retrying in 2s... (Attempt " + (i+1) + "/" + maxRetries + ")");
                        Thread.sleep(2000);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     System.out.println("Gemini Rate Limit reached! Falling back to GroqService for name analysis...");
                     return groqService.analyzeIngredientsByName(productName);
                }
                System.out.println("Gemini failed for name analysis, falling back to GroqService: " + e.getMessage());
                return groqService.analyzeIngredientsByName(productName);
            }
        }
        System.out.println("Gemini exhausted retries for name analysis, falling back to GroqService...");
        return groqService.analyzeIngredientsByName(productName);
    }

    private String extractJson(String rawText) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\{.*\\}", java.util.regex.Pattern.DOTALL).matcher(rawText);
        if (matcher.find()) {
            return matcher.group();
        }
        return rawText;
    }

    public com.digout.dto.OpenFoodFactsDTO getIngredientsDatabaseFallback(String productName) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            String dbPrompt = "You are a product ingredient database. The user is searching for '" + productName.replace("'", "") + "'. Output a JSON object containing 'product_name' and 'ingredients_text' (a comma separated string of typical ingredients for the global/popular version of this product) based on your knowledge. Output RAW JSON ONLY.";
            
            Map<String, Object> payload = Map.of(
                    "model", "gemini-3.7-flash",
                    "store", false,
                    "input", List.of(
                            Map.of("type", "text", "text", dbPrompt)
                    )
            );

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GEMINI_API_URL + geminiApiKey, request, String.class);

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode steps = root.path("steps");
            String jsonText = "";

            for (JsonNode step : steps) {
                if (("model_output".equals(step.path("type").asText()) || step.has("modelOutput")) && (step.has("content") || step.path("modelOutput").has("text"))) {
                    if (step.has("content")) {
                         jsonText = step.path("content").get(0).path("text").asText();
                    } else {
                         jsonText = step.path("modelOutput").path("text").asText();
                    }
                    break;
                }
            }
            jsonText = extractJson(jsonText);
            JsonNode parsedJson = objectMapper.readTree(jsonText);
            return new com.digout.dto.OpenFoodFactsDTO(
                parsedJson.path("product_name").asText(productName),
                parsedJson.path("ingredients_text").asText("")
            );
        } catch (Exception e) {
            throw new RuntimeException("Fallback database AI failed: " + e.getMessage(), e);
        }
    }
}

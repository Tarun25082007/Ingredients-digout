package com.digout.controllers;

import com.digout.dto.OpenFoodFactsDTO;
import com.digout.services.OpenFoodFactsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/compare")
public class ComparisonController {

    private final OpenFoodFactsService openFoodFactsService;

    public ComparisonController(OpenFoodFactsService openFoodFactsService) {
        this.openFoodFactsService = openFoodFactsService;
    }

    @GetMapping("/search")
    public ResponseEntity<?> compareProductByName(
            @RequestParam(required = false) String name,
            @RequestParam(value = "countryCode", defaultValue = "world") String countryCode) {
        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Product name parameter 'name' is required and cannot be blank."));
        }

        String sanitizedName = name.trim();
        if (sanitizedName.length() > 255) {
            if (Character.isHighSurrogate(sanitizedName.charAt(254))) {
                sanitizedName = sanitizedName.substring(0, 254);
            } else {
                sanitizedName = sanitizedName.substring(0, 255);
            }
        }

        String sanitizedCountry = (countryCode != null && !countryCode.trim().isEmpty()) 
                ? countryCode.trim().toLowerCase().replaceAll("[^a-zA-Z0-9-]", "") 
                : "world";
        if (sanitizedCountry.length() > 32) sanitizedCountry = sanitizedCountry.substring(0, 32);
        if (sanitizedCountry.isEmpty()) sanitizedCountry = "world";

        try {
            OpenFoodFactsDTO data = openFoodFactsService.searchProductByName(sanitizedName, sanitizedCountry);
            return ResponseEntity.ok(data);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}

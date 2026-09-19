package com.digout.models;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "canonical_email", nullable = false, unique = true)
    private String canonicalEmail;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name")
    @jakarta.persistence.Convert(converter = com.digout.security.CryptoConverter.class)
    private String fullName;

    private String role;

    private Integer age;

    private String gender;

    @Column(name = "height_cm")
    private Double heightCm;

    @Column(name = "weight_kg")
    private Double weightKg;

    @Column(name = "activity_level")
    private String activityLevel;

    @Column(name = "calorie_goal")
    private String calorieGoal;

    @Column(name = "medical_conditions", columnDefinition = "TEXT")
    @jakarta.persistence.Convert(converter = com.digout.security.CryptoConverter.class)
    private String medicalConditions;

    @Column(name = "profile_completed")
    @Builder.Default
    private Boolean profileCompleted = false;

    @Column(name = "strictness_level")
    @Builder.Default
    private String strictnessLevel = "STANDARD";

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void populateCanonicalEmail() {
        if (this.canonicalEmail == null && this.email != null) {
            this.canonicalEmail = com.digout.util.EmailUtils.canonicalize(this.email);
        }
    }
}
